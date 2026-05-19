// Background service worker – minimal setup
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[JP Caption Translator] Extension installed. Please configure API key in Settings.');
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    console.log('[JP Caption Translator] Extension updated.');
  }
});
