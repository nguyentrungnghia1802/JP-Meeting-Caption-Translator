// Background service worker – minimal setup
import { translateWithGoogle } from '../shared/translator';

// ─── Google Translate proxy ──────────────────────────────────────────────────
// Content scripts on Google Meet are subject to the page's strict CSP, which
// blocks fetch() to translate.googleapis.com.  Routing through the service
// worker (extension context, CSP-exempt) fixes the "Failed to fetch" error.
chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if (
    typeof msg === 'object' && msg !== null &&
    (msg as Record<string, unknown>)['type'] === 'TRANSLATE_GOOGLE'
  ) {
    const { text, sourceLanguage, targetLanguage } = msg as {
      text: string; sourceLanguage: string; targetLanguage: string;
    };
    translateWithGoogle(text, sourceLanguage, targetLanguage)
      .then(result => { sendResponse({ ok: true, result }); })
      .catch(err => { sendResponse({ ok: false, error: (err as Error).message ?? String(err) }); });
    return true; // keep the message channel open for the async response
  }
  return false;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[JP Caption Translator] Extension installed. Please configure API key in Settings.');
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    console.log('[JP Caption Translator] Extension updated.');
  }
});
