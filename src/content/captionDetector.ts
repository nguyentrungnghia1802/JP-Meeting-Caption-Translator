import { isValidCaption } from '../shared/japanese';

// Caption selector strategies for Google Meet (resilient to class changes)
const CAPTION_SELECTORS = [
  // Primary: Google Meet's known caption container data-attributes
  '[data-message-text]',
  // Aria-live regions likely used for captions
  '[aria-live="polite"]',
  '[aria-live="assertive"]',
  // Role-based
  '[role="region"]',
  // Common Google Meet caption class patterns (heuristic)
  '.a4cQT',
  '.CNusmb',
  '.TBMuR',
  '.bh44r',
];

function getCaptionCandidates(): string[] {
  const texts = new Set<string>();

  for (const selector of CAPTION_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        const text = el.textContent?.trim() ?? '';
        if (text.length > 0) texts.add(text);
      });
    } catch {
      // Invalid selector — skip
    }
  }

  // Fallback: walk all visible text nodes looking for Japanese
  walkForJapaneseText(document.body, texts);

  return Array.from(texts).filter(isValidCaption);
}

function walkForJapaneseText(root: Element | null, results: Set<string>): void {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent?.trim() ?? '';
    if (text.length >= 3 && isValidCaption(text)) {
      results.add(text);
    }
    node = walker.nextNode();
  }
}

export function detectCaptionText(): string | null {
  const candidates = getCaptionCandidates();
  if (candidates.length === 0) return null;

  // Prefer the longest candidate (most likely to be full sentence)
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}
