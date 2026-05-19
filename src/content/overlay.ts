const OVERLAY_ID = 'jp-caption-translator-overlay';

// Pre-allocated stable DOM references – avoids querying the DOM on every update
interface OverlayNodes {
  container: HTMLElement;
  originalLine: HTMLElement;
  translationLine: HTMLElement;
}

let nodes: OverlayNodes | null = null;

function ensureOverlay(): OverlayNodes {
  // Re-use if still attached
  if (nodes && document.body.contains(nodes.container)) return nodes;

  // Remove any stale leftover
  document.getElementById(OVERLAY_ID)?.remove();

  const container = document.createElement('div');
  container.id = OVERLAY_ID;
  // Note: backdrop-filter: blur is intentionally omitted – it triggers GPU compositing
  // on every repaint which causes jank in video-heavy pages like Google Meet.
  container.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    max-width: 720px;
    width: 90%;
    background: rgba(0, 0, 0, 0.82);
    border-radius: 12px;
    padding: 14px 20px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.6);
    font-family: 'Segoe UI', 'Noto Sans JP', 'Hiragino Sans', sans-serif;
    pointer-events: none;
    transition: opacity 0.2s ease;
    opacity: 0;
    display: none;
  `;

  const originalLine = document.createElement('div');
  originalLine.style.cssText = `
    font-size: 13px;
    color: rgba(255,255,255,0.6);
    margin-bottom: 6px;
    line-height: 1.5;
    letter-spacing: 0.3px;
    word-break: break-word;
  `;

  const translationLine = document.createElement('div');
  translationLine.style.cssText = `
    font-size: 18px;
    color: #ffffff;
    font-weight: 600;
    line-height: 1.5;
    letter-spacing: 0.2px;
    word-break: break-word;
  `;

  container.appendChild(originalLine);
  container.appendChild(translationLine);
  document.body.appendChild(container);

  nodes = { container, originalLine, translationLine };
  return nodes;
}

function showContainer(): void {
  const { container } = ensureOverlay();
  container.style.display = 'block';
  // Schedule opacity change after display:block is painted
  requestAnimationFrame(() => { container.style.opacity = '1'; });
}

export function showOverlay(original: string, translation: string): void {
  const { originalLine, translationLine } = ensureOverlay();
  // textContent avoids HTML parsing overhead and prevents XSS
  originalLine.textContent = original;
  translationLine.textContent = translation;
  translationLine.style.color = '#ffffff';
  translationLine.style.fontSize = '18px';
  showContainer();
}

export function showError(message: string): void {
  const { originalLine, translationLine } = ensureOverlay();
  originalLine.textContent = '';
  translationLine.textContent = `⚠️ ${message}`;
  translationLine.style.color = '#fca5a5';
  translationLine.style.fontSize = '13px';
  showContainer();
}

export function showStatus(message: string): void {
  const { originalLine, translationLine } = ensureOverlay();
  originalLine.textContent = '';
  translationLine.textContent = message;
  translationLine.style.color = 'rgba(255,255,255,0.7)';
  translationLine.style.fontSize = '13px';
  showContainer();
}

export function hideOverlay(): void {
  if (!nodes) return;
  nodes.container.style.opacity = '0';
  setTimeout(() => {
    if (nodes) nodes.container.style.display = 'none';
  }, 200);
}
