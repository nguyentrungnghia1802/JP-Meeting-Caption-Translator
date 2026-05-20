import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../shared/storage';
import type { ExtensionMessage } from '../shared/messages';

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'];

export default function Options() {
  const [provider, setProvider] = useState<'google' | 'openai'>('google');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [sourceLanguage, setSourceLanguage] = useState('Japanese');
  const [targetLanguage, setTargetLanguage] = useState('Vietnamese');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings().then((s) => {
      setProvider(s.provider ?? 'google');
      setApiKey(s.apiKey);
      setModel(s.model);
      setSourceLanguage(s.sourceLanguage);
      setTargetLanguage(s.targetLanguage);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    await saveSettings({ provider, apiKey, model, sourceLanguage, targetLanguage });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);

    // Notify active Google Meet tab so settings take effect immediately
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && tab.url?.includes('meet.google.com')) {
        const msg: ExtensionMessage = { type: 'SETTINGS_UPDATED' };
        await chrome.tabs.sendMessage(tab.id, msg).catch(() => {/* content script may not be loaded */});
      }
    } catch {
      // Non-critical – settings are persisted regardless
    }
  };

  if (loading) return <div style={styles.container}><p>Loading…</p></div>;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>⚙️ JP Caption Translator Settings</h1>

      <div style={styles.field}>
        <label style={styles.label}>Translation Provider</label>
        <select style={styles.select} value={provider} onChange={(e) => setProvider(e.target.value as 'google' | 'openai')}>
          <option value="google">Google Translate (Free, no API key)</option>
          <option value="openai">OpenAI (requires API key)</option>
        </select>
      </div>

      {provider === 'openai' && (
        <>
          <div style={styles.field}>
            <label style={styles.label}>OpenAI API Key</label>
            <input
              type="password"
              style={styles.input}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
            />
            <p style={styles.hint}>
              Your API key is stored only in your browser (chrome.storage.local) and is never sent anywhere except directly to OpenAI.
            </p>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Model</label>
            <select style={styles.select} value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </>
      )}

      <div style={styles.field}>
        <label style={styles.label}>Source Language</label>
        <select style={styles.select} value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)}>
          <option value="Japanese">Japanese 🇯🇵</option>
          <option value="English">English 🇬🇧</option>
          <option value="Vietnamese">Vietnamese 🇻🇳</option>
          <option value="Chinese">Chinese 🇨🇳</option>
          <option value="Korean">Korean 🇰🇷</option>
        </select>
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Target Language</label>
        <select style={styles.select} value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
          <option value="Vietnamese">Vietnamese 🇻🇳</option>
          <option value="English">English 🇬🇧</option>
          <option value="Japanese">Japanese 🇯🇵</option>
          <option value="Chinese (Simplified)">Chinese (Simplified) 🇨🇳</option>
          <option value="Korean">Korean 🇰🇷</option>
        </select>
      </div>

      <button style={styles.button} onClick={handleSave}>
        Save Settings
      </button>

      {saved && <p style={styles.success}>✅ Settings saved successfully!</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "'Segoe UI', sans-serif",
    maxWidth: 480,
    margin: '32px auto',
    padding: '0 24px',
    color: '#1f2937',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 24,
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: 12,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    boxSizing: 'border-box',
    outline: 'none',
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    boxSizing: 'border-box',
    background: '#fff',
    cursor: 'pointer',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 6,
    cursor: 'pointer',
    marginTop: 4,
  },
  success: {
    color: '#059669',
    fontSize: 13,
    marginTop: 12,
    fontWeight: 600,
  },
};
