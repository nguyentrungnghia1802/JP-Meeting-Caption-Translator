import { startObserver, stopObserver, clearTranslationCache } from './captionObserver';
import { hideOverlay, showStatus } from './overlay';
import { getSettings } from '../shared/storage';
import type { ExtensionMessage } from '../shared/messages';

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse: (response: { ok: boolean }) => void) => {
  handleMessage(message).then(sendResponse).catch(() => sendResponse({ ok: false }));
  return true; // keep channel open for async response
});

async function handleMessage(message: ExtensionMessage): Promise<{ ok: boolean }> {
  switch (message.type) {
    case 'START_TRANSLATION': {
      const settings = await getSettings();
      const needsKey = settings.provider !== 'google';
      if (needsKey && !settings.apiKey) {
        showStatus('⚠️ No API key. Please configure in Settings.');
        return { ok: false };
      }
      showStatus('🔄 Waiting for Japanese captions…');
      startObserver(settings);
      return { ok: true };
    }
    case 'STOP_TRANSLATION': {
      stopObserver();
      hideOverlay();
      return { ok: true };
    }
    case 'SETTINGS_UPDATED': {
      const settings = await getSettings();
      stopObserver();
      // Clear cache so stale translations from the old language pair are discarded
      clearTranslationCache();
      const canStart = settings.isEnabled && (settings.provider === 'google' || !!settings.apiKey);
      if (canStart) {
        startObserver(settings);
      }
      return { ok: true };
    }
    case 'GET_STATUS': {
      return { ok: true };
    }
    default:
      return { ok: false };
  }
}

// Auto-start if previously enabled (e.g. page reload)
getSettings().then((settings) => {
  const canStart = settings.isEnabled && (settings.provider === 'google' || !!settings.apiKey);
  if (canStart) {
    showStatus('🔄 Waiting for Japanese captions…');
    startObserver(settings);
  }
});
