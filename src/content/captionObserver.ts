import { detectAllCaptions } from './captionDetector';
import { showOverlay, showError, showStatus } from './overlay';
import { translateTextStream, translateWithGoogle } from '../shared/translator';
import type { ExtensionSettings } from '../shared/storage';

// Poll interval: check every 1.5 s. Google Translate is fast (~150 ms) so
// rate-limit is not a concern. 1.5 s lets us keep up with ~40 sentences/min.
const POLL_MS = 1500;

// LRU cap – prevents unbounded memory growth in long meetings
const MAX_CACHE_SIZE = 200;

// Translation cache persists across Stop/Start to avoid re-translating
// the same sentences when the user briefly toggles the extension.
const translationCache = new Map<string, string>();
// Tracks sentences already appended to the overlay (avoids duplicate entries)
const displayedTexts = new Set<string>();

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastProcessedText = '';
let inflightController: AbortController | null = null;

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
  lastProcessedText = '';
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function startObserver(settings: ExtensionSettings): void {
  if (pollTimer !== null) return; // already running

  lastProcessedText = '';

  pollTimer = setInterval(() => {
    void processCaption(settings);
  }, POLL_MS);

  // Also run immediately on start (don't wait for first interval)
  void processCaption(settings);
}

export function stopObserver(): void {
  if (inflightController) {
    inflightController.abort();
    inflightController = null;
  }
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  lastProcessedText = '';
  displayedTexts.clear();
}

// ─── Caption processing ──────────────────────────────────────────────────────

async function processCaption(settings: ExtensionSettings): Promise<void> {
  const allTexts = detectAllCaptions(settings.sourceLanguage);
  if (allTexts.length === 0) {
    console.debug('[JP-Translator] no caption detected');
    return;
  }

  // Show any cached sentences not yet displayed (catches up after page reload)
  for (const t of allTexts) {
    if (!displayedTexts.has(t)) {
      const hit = translationCache.get(t);
      if (hit !== undefined) {
        displayedTexts.add(t);
        showOverlay(t, hit);
      }
    }
  }

  // Find oldest sentence not yet translated and not currently in-flight
  const unseen = allTexts.filter(t => !translationCache.has(t) && t !== lastProcessedText);
  if (unseen.length === 0) return;

  // Process one at a time (oldest first = chronological order)
  const text = unseen[0];
  console.debug('[JP-Translator] translating:', text);
  lastProcessedText = text;

  // Cancel previous in-flight request
  if (inflightController) inflightController.abort();
  inflightController = new AbortController();
  const { signal } = inflightController;

  showStatus('⏳ Translating…');

  try {
    let translation: string;

    if (settings.provider === 'google') {
      // Free, no API key needed, fast
      translation = await translateWithGoogle(
        text,
        settings.sourceLanguage,
        settings.targetLanguage,
        signal,
      );
      if (translation) {
        setCached(text, translation);
        displayedTexts.add(text);
        showOverlay(text, translation);
      }
    } else {
      // OpenAI streaming
      translation = await translateTextStream(
        {
          text,
          apiKey: settings.apiKey,
          model: settings.model,
          sourceLanguage: settings.sourceLanguage,
          targetLanguage: settings.targetLanguage,
        },
        (partial) => showOverlay(text, partial),
        signal,
      );
      if (translation) {
        setCached(text, translation);
        displayedTexts.add(text);
        showOverlay(text, translation);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    const message = err instanceof Error
      ? err.message
      : 'Translation error. Please check API key/settings.';
    console.error('[JP-Translator] translation error:', message);
    showError(message);
  } finally {
    inflightController = null;
  }
}

