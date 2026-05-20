import { detectCaptionText } from './captionDetector';
import { showOverlay, showError, showStatus } from './overlay';
import { translateTextStream } from '../shared/translator';
import type { ExtensionSettings } from '../shared/storage';

// Poll interval: check for new captions every 3 seconds.
// Simpler and more reliable than MutationObserver + debounce on Google Meet,
// which fires hundreds of unrelated DOM mutations and starves the timer.
// 3s reduces OpenAI API call frequency to avoid rate-limit (429) errors.
const POLL_MS = 3000;

// LRU cap – prevents unbounded memory growth in long meetings
const MAX_CACHE_SIZE = 200;

// Translation cache persists across Stop/Start to avoid re-translating
// the same sentences when the user briefly toggles the extension.
const translationCache = new Map<string, string>();

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
}

// ─── Caption processing ──────────────────────────────────────────────────────

async function processCaption(settings: ExtensionSettings): Promise<void> {
  const text = detectCaptionText();
  if (!text) {
    console.debug('[JP-Translator] no caption detected');
    return;
  }

  console.debug('[JP-Translator] detected:', text);

  if (text === lastProcessedText) return;
  lastProcessedText = text;

  // Cache hit → instant display, no API call
  const cached = translationCache.get(text);
  if (cached !== undefined) {
    showOverlay(text, cached);
    return;
  }

  // Cancel previous in-flight request
  if (inflightController) inflightController.abort();
  inflightController = new AbortController();
  const { signal } = inflightController;

  showStatus('⏳ Translating…');

  try {
    const translation = await translateTextStream(
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
      showOverlay(text, translation);
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

