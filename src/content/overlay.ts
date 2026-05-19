const OVERLAY_ID = 'jp-caption-translator-overlay';

function getOrCreateOverlay(): HTMLElement {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      max-width: 720px;
      width: 90%;
      background: rgba(0, 0, 0, 0.78);
      backdrop-filter: blur(6px);
      border-radius: 12px;
      padding: 14px 20px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
      font-family: 'Segoe UI', 'Noto Sans JP', 'Hiragino Sans', sans-serif;
      pointer-events: none;
      transition: opacity 0.3s ease;
      opacity: 0;
      display: none;
    `;
    document.body.appendChild(overlay);
  }
  return overlay;
}

export function showOverlay(original: string, translation: string): void {
  const overlay = getOrCreateOverlay();
  overlay.innerHTML = `
    <div style="
      font-size: 13px;
      color: rgba(255,255,255,0.6);
      margin-bottom: 6px;
      line-height: 1.5;
      letter-spacing: 0.3px;
    ">${escapeHtml(original)}</div>
    <div style="
      font-size: 18px;
      color: #ffffff;
      font-weight: 600;
      line-height: 1.5;
      letter-spacing: 0.2px;
    ">${escapeHtml(translation)}</div>
  `;
  overlay.style.display = 'block';
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });
}

export function showError(message: string): void {
  const overlay = getOrCreateOverlay();
  overlay.innerHTML = `
    <div style="
      font-size: 13px;
      color: #fca5a5;
      line-height: 1.5;
    ">⚠️ ${escapeHtml(message)}</div>
  `;
  overlay.style.display = 'block';
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });
}

export function showStatus(message: string): void {
  const overlay = getOrCreateOverlay();
  overlay.innerHTML = `
    <div style="
      font-size: 13px;
      color: rgba(255,255,255,0.7);
      line-height: 1.5;
    ">${escapeHtml(message)}</div>
  `;
  overlay.style.display = 'block';
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });
}

export function hideOverlay(): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 300);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
