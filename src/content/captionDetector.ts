import { getValidator } from '../shared/japanese';

// Caption container selectors – ordered from most-specific to least-specific.
// Derived from live DevTools inspection of Google Meet (2025) caption DOM:
//   div[jsname="dsyhDe"].iOzk7
//     └─ div[role="region"][aria-label="Phụ đề / Captions"]
//          └─ div.nMcdL.bj4p3b
//               └─ div.ygIcle.VbkSUe   ← direct text container
const CONTAINER_SELECTORS = [
  // ── Exact selectors from DevTools inspection (most reliable) ──────────────
  '.ygIcle',                      // direct text container (div.ygIcle.VbkSUe)
  '[jsname="dsyhDe"]',            // caption area – jsname is more stable than class
  '.nMcdL',                       // caption item wrapper
  '.iOzk7',                       // outer caption panel
  // ── Accessibility (stable across deploys) ─────────────────────────────────
  '[role="region"][aria-label]',  // Meet uses role=region NOT aria-live for captions
  '[aria-live="polite"]',
  '[aria-live="assertive"]',
  '[role="log"]',
  // ── Legacy / fallback class names ─────────────────────────────────────────
  '[data-message-text]',
  '.a4cQT', '.CNusmb', '.TBMuR', '.bh44r',
  '.Mz6pEf', '.zTETae',
];

// Walk up to 5 000 text nodes – Google Meet's DOM is very deep.
const MAX_WALK_NODES = 5000;

/**
 * Fast path: try known selectors first.
 * Returns the first selector-based text set that contains valid captions, or [].
 */
function detectViaSelectors(validate: (t: string) => boolean): string[] {
  for (const selector of CONTAINER_SELECTORS) {
    try {
      const found: string[] = [];
      document.querySelectorAll(selector).forEach((el) => {
        const text = extractLatestCaption(el);
        if (validate(text)) found.push(text);
      });
      if (found.length > 0) {
        console.debug('[JP-Translator] caption via selector:', selector);
        return found;
      }
    } catch {
      // Invalid selector for this browser – skip
    }
  }
  return [];
}

/**
 * Slow-path fallback: walk text nodes up to MAX_WALK_NODES.
 */
function detectViaWalk(root: Element, validate: (t: string) => boolean): string[] {
  const results: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let count = 0;
  while (node && count < MAX_WALK_NODES) {
    count++;
    const text = node.textContent?.trim() ?? '';
    if (validate(text)) results.push(text);
    node = walker.nextNode();
  }
  if (results.length > 0) {
    console.debug('[JP-Translator] caption via text-walk, nodes scanned:', count);
  }
  return results;
}

/**
 * Nuclear fallback: scan every element in the document looking for caption text.
 * Skips containers whose textContent is excessively long (entire page body).
 */
function detectViaFullScan(validate: (t: string) => boolean): string[] {
  const results: string[] = [];
  const all = document.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    // Skip non-visible or structural elements
    if (el.children.length > 20) continue; // too many children → structural container
    const text = el.textContent?.trim() ?? '';
    if (text.length > 500) continue;        // too long → structural container
    if (validate(text)) results.push(text);
  }
  if (results.length > 0) {
    console.debug('[JP-Translator] caption via full-scan');
  }
  return results;
}

/**
 * Extracts the most recent caption sentence from a container element.
 * Google Meet accumulates multiple sentences as separate child text nodes
 * inside .ygIcle – we want only the last (newest) one.
 */
function extractLatestCaption(el: Element): string {
  // Collect direct text nodes first (Google Meet puts each sentence as a text node)
  const textNodes: string[] = [];
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim() ?? '';
      if (t.length > 0) textNodes.push(t);
    }
  });

  // Return the last text node – it's the most recently added sentence.
  // Do NOT fall back to el.textContent: it would concatenate participant names,
  // icon strings ("arrow_downward"), and UI buttons from nested child elements.
  return textNodes.length > 0 ? textNodes[textNodes.length - 1] : '';
}

/**
 * Returns ALL unique caption sentences visible in the DOM in document order.
 * Uses the appropriate validator for the given source language.
 */
export function detectAllCaptions(sourceLanguage: string): string[] {
  const validate = getValidator(sourceLanguage);
  let candidates: string[];

  candidates = detectViaSelectors(validate);
  if (candidates.length === 0) candidates = detectViaWalk(document.body, validate);
  if (candidates.length === 0) candidates = detectViaFullScan(validate);
  if (candidates.length === 0) {
    console.debug('[JP-Translator] no caption found in DOM for language:', sourceLanguage);
    return [];
  }

  // Deduplicate while preserving DOM (chronological) order
  return [...new Set(candidates)];
}
