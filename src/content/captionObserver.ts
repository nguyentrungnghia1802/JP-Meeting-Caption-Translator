import { detectCaptionText } from './captionDetector';
import { showOverlay, showError } from './overlay';
import { translateText } from '../shared/translator';
import type { ExtensionSettings } from '../shared/storage';

const DEBOUNCE_MS = 800;
const translationCache = new Map<string, string>();

let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastProcessedText = '';

export function startObserver(settings: ExtensionSettings): void {
  if (observer) return; // already running

  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      processCaption(settings);
    }, DEBOUNCE_MS);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

export function stopObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  lastProcessedText = '';
  translationCache.clear();
}

async function processCaption(settings: ExtensionSettings): Promise<void> {
  const text = detectCaptionText();
  if (!text) return;
  if (text === lastProcessedText) return;

  lastProcessedText = text;

  // Return cached translation immediately
  if (translationCache.has(text)) {
    showOverlay(text, translationCache.get(text)!);
    return;
  }

  try {
    const translation = await translateText({
      text,
      apiKey: settings.apiKey,
      model: settings.model,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
    });
    translationCache.set(text, translation);
    showOverlay(text, translation);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Translation error. Please check API key/settings.';
    showError(message);
  }
}
