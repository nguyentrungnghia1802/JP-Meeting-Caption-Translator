const OVERLAY_ID = 'jp-caption-translator-overlay';

interface OverlayWindow {
  container: HTMLElement;
  body: HTMLElement;
  statusBar: HTMLElement;
  /** original text of the last appended entry (for streaming updates) */
  lastOriginal: string;
  /** translation div of the last entry (for streaming updates) */
  lastTranslationEl: HTMLElement | null;
}

let win: OverlayWindow | null = null;

// ─── Build the draggable window ──────────────────────────────────────────────

function buildWindow(): OverlayWindow {
  document.getElementById(OVERLAY_ID)?.remove();

  // ── Outer container ──────────────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = OVERLAY_ID;
  container.style.cssText = `
    position: fixed;
    bottom: 90px;
    right: 20px;
    z-index: 2147483647;
    width: 420px;
    height: 380px;
    min-width: 280px;
    min-height: 160px;
    resize: both;
    background: rgba(15, 15, 20, 0.93);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
    font-family: 'Segoe UI', 'Noto Sans JP', 'Hiragino Sans', sans-serif;
    font-size: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    opacity: 0;
    transition: opacity 0.2s ease;
    user-select: none;
  `;

  // ── Header (drag handle) ─────────────────────────────────────────────────
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(255,255,255,0.07);
    cursor: grab;
    flex-shrink: 0;
  `;
  const title = document.createElement('span');
  title.textContent = '🇯🇵 JP Translator';
  title.style.cssText = `font-size: 0.857em; color: rgba(255,255,255,0.6); font-weight: 600; letter-spacing: 0.5px;`;

  const clearBtn = document.createElement('button');
  clearBtn.textContent = '🗑';
  clearBtn.title = 'Clear history';
  clearBtn.style.cssText = `
    background: none; border: none; color: rgba(255,255,255,0.4);
    cursor: pointer; font-size: 0.929em; padding: 2px 6px; border-radius: 4px;
    transition: color 0.15s;
  `;
  clearBtn.onmouseenter = () => { clearBtn.style.color = '#fff'; };
  clearBtn.onmouseleave = () => { clearBtn.style.color = 'rgba(255,255,255,0.4)'; };
  clearBtn.onclick = () => { if (win) { win.body.innerHTML = ''; win.lastOriginal = ''; win.lastTranslationEl = null; } };

  header.appendChild(title);
  header.appendChild(clearBtn);

  // ── Scrollable body ──────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.cssText = `
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.2) transparent;
  `;

  // ── Status bar ───────────────────────────────────────────────────────────
  const statusBar = document.createElement('div');
  statusBar.style.cssText = `
    padding: 5px 14px 7px;
    font-size: 0.786em;
    color: rgba(255,255,255,0.45);
    border-top: 1px solid rgba(255,255,255,0.07);
    min-height: 22px;
    flex-shrink: 0;
  `;

  container.appendChild(header);
  container.appendChild(body);
  container.appendChild(statusBar);
  document.body.appendChild(container);

  // ── Drag logic ───────────────────────────────────────────────────────────
  let dragOffX = 0, dragOffY = 0, dragging = false;

  header.addEventListener('mousedown', (e) => {
    dragging = true;
    header.style.cursor = 'grabbing';
    const rect = container.getBoundingClientRect();
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const x = Math.max(0, Math.min(e.clientX - dragOffX, window.innerWidth - container.offsetWidth));
    const y = Math.max(0, Math.min(e.clientY - dragOffY, window.innerHeight - container.offsetHeight));
    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
    container.style.right = 'auto';
    container.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    header.style.cursor = 'grab';
  });

  // ── Font scaling on resize ───────────────────────────────────────────────
  // Scale the container's base font-size proportionally to its width so all
  // em-based children (title, captions, status) grow/shrink together.
  new ResizeObserver(() => {
    const sz = Math.max(10, Math.round(container.offsetWidth / 30));
    container.style.fontSize = sz + 'px';
  }).observe(container);

  win = { container, body, statusBar, lastOriginal: '', lastTranslationEl: null };
  return win;
}

function ensureWindow(): OverlayWindow {
  if (win && document.body.contains(win.container)) return win;
  return buildWindow();
}

function showWindow(): void {
  const w = ensureWindow();
  w.container.style.display = 'flex';
  requestAnimationFrame(() => { w.container.style.opacity = '1'; });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Append a new translation entry, or update the last entry if the original
 * text is the same (streaming) OR is an accumulation of the last original
 * (Google Meet grows captions in a single text node: "alarm." → "alarm. alarm.").
 */
export function showOverlay(original: string, translation: string): void {
  const w = ensureWindow();
  showWindow();

  const lastOrig = w.lastOriginal;
  // Treat as an in-place update when:
  //  • exact streaming match, OR
  //  • the new text extends the last (accumulating caption), OR
  //  • the last text extends the new (caption being corrected / shortened)
  const isAccumulation =
    lastOrig.length > 0 &&
    (original.startsWith(lastOrig) || lastOrig.startsWith(original));

  if ((original === lastOrig || isAccumulation) && w.lastTranslationEl) {
    // Update existing entry in place
    w.lastTranslationEl.textContent = translation;
    w.lastOriginal = original;
  } else {
    // New sentence: append a new entry
    const entry = document.createElement('div');
    entry.style.cssText = `
      border-left: 2px solid rgba(255,255,255,0.15);
      padding-left: 10px;
    `;

    const origEl = document.createElement('div');
    origEl.textContent = original;
    origEl.style.cssText = `font-size: 0.857em; color: rgba(255,255,255,0.5); margin-bottom: 3px; word-break: break-word;`;

    const transEl = document.createElement('div');
    transEl.textContent = translation;
    transEl.style.cssText = `font-size: 1.143em; color: #ffffff; font-weight: 600; line-height: 1.5; word-break: break-word;`;

    entry.appendChild(origEl);
    entry.appendChild(transEl);
    w.body.appendChild(entry);

    w.lastOriginal = original;
    w.lastTranslationEl = transEl;

    // Auto-scroll to the newest entry
    w.body.scrollTop = w.body.scrollHeight;
  }

  w.statusBar.textContent = '';
}

export function showError(message: string): void {
  const w = ensureWindow();
  showWindow();
  w.statusBar.textContent = `⚠️ ${message}`;
  w.statusBar.style.color = '#fca5a5';
}

export function showStatus(message: string): void {
  const w = ensureWindow();
  showWindow();
  w.statusBar.textContent = message;
  w.statusBar.style.color = 'rgba(255,255,255,0.45)';
}

export function hideOverlay(): void {
  if (!win) return;
  win.container.style.opacity = '0';
  setTimeout(() => {
    if (win) win.container.style.display = 'none';
  }, 200);
}
