// Shared types for extension settings
export interface ExtensionSettings {
  apiKey: string;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
  isEnabled: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiKey: '',
  model: 'gpt-4o-mini',
  sourceLanguage: 'Japanese',
  targetLanguage: 'Vietnamese',
  isEnabled: false,
};

export async function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (result) => {
      resolve(result as ExtensionSettings);
    });
  });
}

export async function saveSettings(partial: Partial<ExtensionSettings>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(partial, resolve);
  });
}
