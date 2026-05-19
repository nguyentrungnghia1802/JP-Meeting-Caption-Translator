import { detectCaptionText, findContainerForText } from './captionDetector';
import { showOverlay, showError } from './overlay';
import { translateTextStream } from '../shared/translator';
import type { ExtensionSettings } from '../shared/storage';

// Shorter debounce: streaming lets us show partial results early,
// so we can afford to start sooner than the old 800 ms.
const DEBOUNCE_MS = 500;

// LRU cap – prevents unbounded memory growth in long meetings
const MAX_CACHE_SIZE = 200;

// Translation cache persists across Stop/Start to avoid re-translating
// the same sentences when the user briefly toggles the extension.
const translationCache = new Map<string, string>();

let observer: MutationObserver | null = null;
// Starts wide (document.body), narrows to caption container on first hit
let captionRoot: Element = document.body;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastProcessedText = '';
// AbortController for the current in-flight API request
let inflightController: AbortController | null = null;

// ─── LRU helpers ────────────────────────────────────────────────────────────

function setCached(key: string, value: string): void {
  if (translationCache.size >= MAX_CACHE_SIZE) {
    // Map preserves insertion order – delete the oldest entry
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) translationCache.delete(oldest);
  }
  translationCache.set(key, value);
}

/** Call this when source/target language settings change. */
export function clearTranslationCache(): void {
  translationCache.clear();
  lastProcessedText = '';
}

// ─── Observer scope narrowing ────────────────────────────────────────────────

/**
 * After the first caption is detected, tries to narrow the MutationObserver
 * to the specific caption container element. This dramatically reduces the
 * number of mutation callbacks fired by Google Meet's React reconciler.
 */
function tryNarrowScope(text: string): void {
  if (captionRoot !== document.body || !observer) return;

  const container = findContainerForText(text);
  if (!container || container === document.body) return;

  captionRoot = container;
  observer.disconnect();
  observer.observe(captionRoot, { childList: true, subtree: true, characterData: true });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function startObserver(settings: ExtensionSettings): void {
  if (observer) return; // already running

  captionRoot = document.body;

  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { void processCaption(settings); }, DEBOUNCE_MS);
  });

  observer.observe(captionRoot, { childList: true, subtree: true, characterData: true });
}

export function stopObserver(): void {
  // Cancel any in-flight API request immediately
  if (inflightController) {
    inflightController.abort();
    inflightController = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  lastProcessedText = '';
  captionRoot = document.body;
  // Note: translationCache is intentionally NOT cleared here –
  // preserved for instant display when the user re-enables translation.
}

// ─── Caption processing ──────────────────────────────────────────────────────

async function processCaption(settings: ExtensionSettings): Promise<void> {
  const text = detectCaptionText(captionRoot);
  if (!text) return;
  if (text === lastProcessedText) return;

  // Narrow observer scope on first successful caption detection
  if (captionRoot === document.body) tryNarrowScope(text);

  lastProcessedText = text;

  // Cache hit → instant display, no API call
  const cached = translationCache.get(text);
  if (cached !== undefined) {
    showOverlay(text, cached);
    return;
  }

  // Cancel previous request – we have newer text
  if (inflightController) inflightController.abort();
  inflightController = new AbortController();
  const { signal } = inflightController;

  try {
    // translateTextStream calls onChunk as each token arrives,
    // so the overlay updates progressively with partial translations.
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
      // Show the final, clean translation (without trailing partial state)
      showOverlay(text, translation);
    }
  } catch (err) {
    // AbortError is expected when a newer caption preempts this request
    if (err instanceof Error && err.name === 'AbortError') return;
    const message = err instanceof Error
      ? err.message
      : 'Translation error. Please check API key/settings.';
    showError(message);
  } finally {
    inflightController = null;
  }
}
