import { detectAllCaptions } from './captionDetector';
import { showOverlay, showError, showStatus } from './overlay';
import { translateTextStream } from '../shared/translator';
import type { TranslationContext } from '../shared/translator';
import type { ExtensionSettings } from '../shared/storage';
import { isLikelyComplete, normalizeJapanese } from '../shared/japanese';

// Safety-net poll interval.  MutationObserver handles real-time triggers;
// this catches any edge cases where the observer misses a change.
const POLL_MS = 2000;

// Debounce DOM mutations: wait for caption text to stabilise before translating.
// 300 ms avoids translating incomplete mid-sentence fragments.
const DEBOUNCE_MS = 300;

// LRU cap – prevents unbounded memory growth in long meetings
const MAX_CACHE_SIZE = 200;

// Max concurrent Google Translate requests (it's fast, safe to batch).
// OpenAI stays serial (1 at a time) to preserve streaming UX.
const PARALLEL_MAX = 3;

// Ignore caption fragments shorter than this – they are almost always
// incomplete or noise (single punctuation, partial kana, etc.)
const MIN_TEXT_LENGTH = 4;

// When a caption is still growing (streaming), only re-translate once it has
// gained at least this many characters since the last translation.
// This limits retranslations of an in-progress sentence to ~2-3 times.
const GROWTH_THRESHOLD = 15;

// Translation cache persists across Stop/Start to avoid re-translating
// the same sentences when the user briefly toggles the extension.
const translationCache = new Map<string, string>();
// Tracks sentences already appended to the overlay (avoids duplicate entries)
const displayedTexts = new Set<string>();
// Texts currently being fetched – prevents launching duplicate requests
const inFlightTexts = new Set<string>();

// Source text of the most recently dispatched translation.
// Used to throttle retranslations of the same slowly-growing caption.
let lastTranslatedSource = '';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let mutationObserver: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// Single abort-controller for the OpenAI stream (one at a time)
let openAiController: AbortController | null = null;

// Rolling context of the last MAX_CONTEXT source→target pairs.
// Passed to OpenAI for conversational coherence; also used by Google.
const MAX_CONTEXT = 3;
const recentContext: TranslationContext[] = [];

// ─── LRU helpers ────────────────────────────────────────────────────────────

function setCached(key: string, value: string): void {
  if (translationCache.size >= MAX_CACHE_SIZE) {
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) translationCache.delete(oldest);
  }
  translationCache.set(key, value);
}

export function clearTranslationCache(): void {
  translationCache.clear();
  displayedTexts.clear();
  inFlightTexts.clear();
  recentContext.length = 0;
  lastTranslatedSource = '';
}

// ─── MutationObserver helpers ────────────────────────────────────────────────

/**
 * Try to attach a MutationObserver to the caption container element.
 * Called after each poll cycle so we pick it up as soon as captions appear.
 * Observing a targeted subtree instead of document.body avoids noise from
 * Meet's own UI animations and keeps CPU usage negligible.
 */
function tryAttachMutationObserver(settings: ExtensionSettings): void {
  if (mutationObserver) return; // already attached

  // Walk candidate selectors from most-specific to least-specific
  const target =
    document.querySelector('.ygIcle')?.closest('[role="region"]') ??
    document.querySelector('[jsname="dsyhDe"]') ??
    document.querySelector('[role="region"][aria-label]') ??
    document.querySelector('[aria-live="polite"]');

  if (!target) return; // captions not yet visible; retry next poll

  mutationObserver = new MutationObserver(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void processCaption(settings);
    }, DEBOUNCE_MS);
  });

  mutationObserver.observe(target, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  console.debug('[JP-Translator] MutationObserver attached to caption container');
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function startObserver(settings: ExtensionSettings): void {
  if (pollTimer !== null) return; // already running

  // Run immediately – no need to wait for the first interval tick
  void processCaption(settings);
  tryAttachMutationObserver(settings);

  // Safety-net: also poll so we never permanently miss a caption
  pollTimer = setInterval(() => {
    void processCaption(settings);
    tryAttachMutationObserver(settings); // re-attempt if not yet attached
  }, POLL_MS);
}

export function stopObserver(): void {
  if (openAiController) { openAiController.abort(); openAiController = null; }
  if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
  if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
  inFlightTexts.clear();
  displayedTexts.clear();
  recentContext.length = 0;
  lastTranslatedSource = '';
}

// ─── Caption processing ──────────────────────────────────────────────────────

/**
 * Returns true if the text ends with sentence-final punctuation.
 * Sentence-final texts bypass the growth throttle so we always capture
 * the completed sentence even if it hasn't grown by GROWTH_THRESHOLD.
 */
function isSentenceFinal(text: string, language: string): boolean {
  const t = text.trim();
  return language === 'Japanese' ? /[。！？!?]$/.test(t) : /[.!?]$/.test(t);
}

async function processCaption(settings: ExtensionSettings): Promise<void> {
  const rawTexts = detectAllCaptions(settings.sourceLanguage);
  if (rawTexts.length === 0) return;

  // Normalize all texts: collapse whitespace to a single space (reduces near-duplicate
  // cache keys that differ only by whitespace). Additionally apply NFKC for Japanese.
  const normalizeWs = (t: string): string => t.trim().replace(/\s+/g, ' ');
  const allTexts =
    settings.sourceLanguage === 'Japanese'
      ? rawTexts.map(t => normalizeJapanese(normalizeWs(t)))
      : rawTexts.map(normalizeWs);

  // Replay cached sentences not yet shown (after restart / page reload)
  for (const t of allTexts) {
    if (!displayedTexts.has(t)) {
      const hit = translationCache.get(t);
      if (hit !== undefined) {
        displayedTexts.add(t);
        showOverlay(t, hit);
      }
    }
  }

  // Skip mid-sentence fragments; only translate likely-complete sentences.
  // Additionally throttle retranslations of a still-growing caption:
  // if the new text is just a small extension of what we last translated,
  // wait until it has grown by GROWTH_THRESHOLD chars (unless sentence-final).
  const lang = settings.sourceLanguage;
  const unseen = allTexts.filter(t => {
    if (t.length < MIN_TEXT_LENGTH) return false;
    if (!isLikelyComplete(t, lang)) return false;
    if (translationCache.has(t)) return false;
    if (inFlightTexts.has(t)) return false;
    // Growth throttle: skip if this is a tiny extension of the last translation
    if (
      lastTranslatedSource.length > 0 &&
      t.startsWith(lastTranslatedSource) &&
      !isSentenceFinal(t, lang)
    ) {
      return t.length - lastTranslatedSource.length >= GROWTH_THRESHOLD;
    }
    return true;
  });
  if (unseen.length === 0) return;

  if (settings.provider === 'google') {
    // Translate up to PARALLEL_MAX captions concurrently.
    // Google Translate (~150 ms / req) is fast enough that batching is safe
    // and gives a big catch-up boost when the extension starts mid-meeting.
    const batch = unseen.slice(0, PARALLEL_MAX);
    batch.forEach(t => inFlightTexts.add(t));
    showStatus('⏳ Translating…');
    await Promise.allSettled(batch.map(t => translateGoogleOne(t, settings)));
  } else {
    // OpenAI: serial – one at a time to preserve streaming updates in the overlay.
    // Cancel the previous stream if a newer caption arrives.
    const text = unseen[0];
    inFlightTexts.add(text);
    if (openAiController) openAiController.abort();
    openAiController = new AbortController();
    showStatus('⏳ Translating…');
    await translateOpenAIOne(text, settings, openAiController.signal);
    openAiController = null;
  }
}

// ─── Per-provider helpers ────────────────────────────────────────────────────

/**
 * Proxy Google Translate through the background service worker.
 * Content scripts on Google Meet are blocked by the page's CSP from fetching
 * translate.googleapis.com directly.  The service worker runs in the extension
 * context (CSP-exempt) so routing through it fixes the "Failed to fetch" error.
 */
function translateViaBackground(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'TRANSLATE_GOOGLE', text, sourceLanguage, targetLanguage },
      (response: { ok: boolean; result?: string; error?: string } | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.ok && response.result !== undefined) {
          resolve(response.result);
        } else {
          reject(new Error(response?.error ?? 'Translation proxy error'));
        }
      },
    );
  });
}

async function translateGoogleOne(text: string, settings: ExtensionSettings): Promise<void> {
  try {
    const translation = await translateViaBackground(
      text,
      settings.sourceLanguage,
      settings.targetLanguage,
    );
    if (translation) {
      setCached(text, translation);
      displayedTexts.add(text);
      showOverlay(text, translation);
      showStatus('');
      lastTranslatedSource = text;
      if (recentContext.length >= MAX_CONTEXT) recentContext.shift();
      recentContext.push({ src: text, tgt: translation });
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    console.error('[JP-Translator] Google Translate error:', err);
    showError(err instanceof Error ? err.message : 'Translation error.');
  } finally {
    inFlightTexts.delete(text);
  }
}

async function translateOpenAIOne(
  text: string,
  settings: ExtensionSettings,
  signal: AbortSignal,
): Promise<void> {
  try {
    const translation = await translateTextStream(
      {
        text,
        apiKey: settings.apiKey,
        model: settings.model,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        context: [...recentContext],
      },
      (partial) => showOverlay(text, partial),
      signal,
    );
    if (translation) {
      setCached(text, translation);
      displayedTexts.add(text);
      showOverlay(text, translation);
      showStatus('');
      lastTranslatedSource = text;
      if (recentContext.length >= MAX_CONTEXT) recentContext.shift();
      recentContext.push({ src: text, tgt: translation });
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    console.error('[JP-Translator] OpenAI error:', err);
    showError(err instanceof Error ? err.message : 'Translation error. Check API key/settings.');
  } finally {
    inFlightTexts.delete(text);
  }
}

