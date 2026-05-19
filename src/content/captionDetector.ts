import { isValidCaption, containsJapanese } from '../shared/japanese';

// Caption container selectors – ordered from most-specific to most-generic.
// We stop at the first selector that yields valid Japanese text.
const CONTAINER_SELECTORS = [
  '[data-message-text]',
  'div[aria-live="polite"]',
  'div[aria-live="assertive"]',
  '.a4cQT',
  '.CNusmb',
  '.TBMuR',
  '.bh44r',
];

// Hard cap on fallback DOM walk to avoid freezing on large DOMs
const MAX_WALK_NODES = 200;

/**
 * Fast path: try known selectors first.
 * Returns the first selector-based text set that contains valid Japanese, or null.
 */
function detectViaSelectors(): string[] {
  for (const selector of CONTAINER_SELECTORS) {
    try {
      const found: string[] = [];
      document.querySelectorAll(selector).forEach((el) => {
        const text = el.textContent?.trim() ?? '';
        if (isValidCaption(text)) found.push(text);
      });
      if (found.length > 0) return found;
    } catch {
      // Invalid selector for this browser – skip
    }
  }
  return [];
}

/**
 * Slow-path fallback: limited DOM walk.
 * Only executed when selector-based detection finds nothing.
 */
function detectViaWalk(root: Element): string[] {
  const results: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let count = 0;
  while (node && count < MAX_WALK_NODES) {
    count++;
    const text = node.textContent?.trim() ?? '';
    if (isValidCaption(text)) results.push(text);
    node = walker.nextNode();
  }
  return results;
}

/**
 * Detects the current Japanese caption text.
 * @param root - Narrow scope after observer has been anchored; defaults to document.body.
 */
export function detectCaptionText(root: Element = document.body): string | null {
  let candidates: string[];

  if (root !== document.body) {
    // Anchored mode: read text directly from the known caption container
    const text = root.textContent?.trim() ?? '';
    candidates = isValidCaption(text) ? [text] : [];

    // Also try direct child spans (Google Meet renders words in nested spans)
    if (candidates.length === 0) {
      root.querySelectorAll('span, div').forEach((el) => {
        const t = el.textContent?.trim() ?? '';
        if (isValidCaption(t)) candidates.push(t);
      });
    }
  } else {
    // Wide-scope mode: selector strategy first, then limited walk
    candidates = detectViaSelectors();
    if (candidates.length === 0) {
      candidates = detectViaWalk(document.body);
    }
  }

  if (candidates.length === 0) return null;
  // Prefer longest text – most likely the full sentence
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

/**
 * Walks up the DOM from a text node containing `textPrefix` to find
 * the nearest aria-live / role="region" ancestor.
 * Used to narrow the MutationObserver scope after the first caption is detected.
 */
export function findContainerForText(textPrefix: string): Element | null {
  if (!containsJapanese(textPrefix)) return null;
  const prefix = textPrefix.slice(0, 12);

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if ((node.textContent ?? '').includes(prefix)) {
      let el: Element | null = node.parentElement;
      while (el && el !== document.body) {
        if (
          el.hasAttribute('aria-live') ||
          el.getAttribute('role') === 'region'
        ) {
          return el;
        }
        el = el.parentElement;
      }
      // No semantic ancestor found – use direct parent block element
      return node.parentElement;
    }
    node = walker.nextNode();
  }
  return null;
}
