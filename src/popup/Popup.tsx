import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../shared/storage';
import type { ExtensionMessage } from '../shared/messages';

type Status = 'running' | 'stopped' | 'no_api_key' | 'not_meet';

export default function Popup() {
  const [status, setStatus] = useState<Status>('stopped');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings().then((s) => {
      if (!s.apiKey) {
        setStatus('no_api_key');
      } else {
        setStatus(s.isEnabled ? 'running' : 'stopped');
      }
      setLoading(false);
    });
  }, []);

  const sendToActiveTab = async (message: ExtensionMessage) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const url = tab.url ?? '';
    if (!url.includes('meet.google.com')) {
      setStatus('not_meet');
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      // Content script may not be ready yet – ignore
    }
  };

  const handleStart = async () => {
    await saveSettings({ isEnabled: true });
    await sendToActiveTab({ type: 'START_TRANSLATION' });
    setStatus('running');
  };

  const handleStop = async () => {
    await saveSettings({ isEnabled: false });
    await sendToActiveTab({ type: 'STOP_TRANSLATION' });
    setStatus('stopped');
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  if (loading) {
    return <div style={styles.container}><p style={{ color: '#6b7280' }}>Loading…</p></div>;
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🇯🇵 JP Caption Translator</h1>

      {status === 'no_api_key' && (
        <div style={styles.warning}>
          ⚠️ No API key configured. Please open Settings.
        </div>
      )}
      {status === 'not_meet' && (
        <div style={styles.warning}>
          ⚠️ This tab is not Google Meet. Please navigate to meet.google.com.
        </div>
      )}

      <div style={styles.statusRow}>
        <span style={styles.statusLabel}>Status:</span>
        <span style={{ ...styles.statusBadge, ...(status === 'running' ? styles.badgeRunning : styles.badgeStopped) }}>
          {status === 'running' ? '● Running' : '○ Stopped'}
        </span>
      </div>

      <div style={styles.actions}>
        <button
          style={{ ...styles.btn, ...styles.btnStart }}
          onClick={handleStart}
          disabled={status === 'running' || status === 'no_api_key'}
        >
          ▶ Start Translation
        </button>
        <button
          style={{ ...styles.btn, ...styles.btnStop }}
          onClick={handleStop}
          disabled={status !== 'running'}
        >
          ■ Stop Translation
        </button>
      </div>

      <button style={styles.settingsLink} onClick={openOptions}>
        ⚙️ Open Settings
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "'Segoe UI', sans-serif",
    width: 280,
    padding: '16px 20px',
    color: '#1f2937',
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 12,
    lineHeight: 1.3,
  },
  warning: {
    backgroundColor: '#fef3c7',
    border: '1px solid #f59e0b',
    color: '#92400e',
    fontSize: 12,
    padding: '8px 10px',
    borderRadius: 6,
    marginBottom: 12,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 12,
  },
  badgeRunning: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
  },
  badgeStopped: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 12,
  },
  btn: {
    padding: '9px 0',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  btnStart: {
    backgroundColor: '#4f46e5',
    color: '#fff',
  },
  btnStop: {
    backgroundColor: '#ef4444',
    color: '#fff',
  },
  settingsLink: {
    background: 'none',
    border: 'none',
    color: '#4f46e5',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  },
};
