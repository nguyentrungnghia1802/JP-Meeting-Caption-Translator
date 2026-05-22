// Detect Japanese characters: Hiragana, Katakana, CJK Kanji
const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/;
// Detect Vietnamese characters (diacritics specific to Vietnamese)
const VIETNAMESE_REGEX = /[\u00C0-\u024F\u1EA0-\u1EF9]/;

export function containsJapanese(text: string): boolean {
  return JAPANESE_REGEX.test(text);
}

// ─── Sentence completeness detection ────────────────────────────────────────

/**
 * Returns true when a Japanese caption appears to be sentence-final.
 * Avoids sending mid-sentence fragments to the translation API.
 *
 * Heuristics (in order of reliability):
 *  1. Ends with full-stop punctuation (。！？!?)
 *  2. Ends with a polite verb form (です、ます、した …)
 *  3. Ends with a sentence-final particle (ね、よ、な …)
 *  4. Long enough (≥ 20 chars) to be a complete thought regardless
 */
export function isJapaneseComplete(text: string): boolean {
  const t = text.trim();
  if (/[。！？!?]$/.test(t)) return true;
  // Polite verb endings (desu/masu family)
  if (/(?:ます|です|した|でした|ました|ません|ましたか|ですか|ますか)$/.test(t)) return true;
  // Extended polite / volitional / request forms
  if (/(?:ましょう|ましょうか|ますね|ですね|ですよ|ますよ|でしょう|てください|ておきます|ています|ていません|てみます|なります|になります|ておりません|ております)$/.test(t)) return true;
  // Sentence-final particles and casual endings
  if (/(?:だね|だよ|だな|かな|よね|かね|わね|のね|のよ|だろう|じゃない|じゃなくて)$/.test(t) && t.length >= 4) return true;
  // Long-enough Japanese text is almost certainly a complete clause
  return containsJapanese(t) && t.length >= 20;
}

/**
 * Returns true when an English caption appears to be sentence-final.
 * Accepts punctuation-terminated sentences and unpunctuated utterances
 * of at least 3 words (typical for meeting speech like "Thank you" / "Sounds good").
 */
export function isEnglishComplete(text: string): boolean {
  const t = text.trim();
  if (/[.!?]$/.test(t)) return true;
  return t.split(/\s+/).filter(Boolean).length >= 3;
}

/**
 * Dispatcher: returns whether a caption in the given source language looks complete.
 * Vietnamese uses the same Latin-script heuristic as English (ends with .!? or ≥3 words).
 * Other languages (Chinese, Korean) are always passed through.
 */
export function isLikelyComplete(text: string, language: string): boolean {
  switch (language) {
    case 'Japanese':   return isJapaneseComplete(text);
    case 'English':
    case 'Vietnamese': return isEnglishComplete(text);
    default:           return true;
  }
}

/**
 * Normalize Japanese text before translation:
 *   - half-width katakana → full-width  (ｱ → ア)
 *   - full-width ASCII    → half-width  (ａ → a)
 *   - other NFKC compatibility mappings
 * Improves Google Translate / OpenAI accuracy with no information loss.
 */
export function normalizeJapanese(text: string): string {
  return text.normalize('NFKC');
}

// Minimum meaningful caption length
const MIN_CAPTION_LENGTH = 3;
const MIN_LATIN_CAPTION_LENGTH = 5;

// UI labels to ignore (Google Meet)
const UI_NOISE = new Set([
  'you',
  'captions',
  'microphone',
  'camera',
  'participants',
  'chat',
  'meeting details',
  'turn on captions',
  'turn off captions',
  'more options',
  'present now',
  'leave call',
  'cc',
  'closed captions',
  'pin',
  'mute',
  'unmute',
]);

/** Validator for Japanese / Chinese / Korean source (requires CJK chars) */
export function isValidCaption(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_CAPTION_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  if (UI_NOISE.has(lower)) return false;
  return JAPANESE_REGEX.test(trimmed);
}

/** Validator for English source (Latin text + noise filter) */
function isValidEnglishCaption(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_LATIN_CAPTION_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  if (UI_NOISE.has(lower)) return false;
  // Must contain at least one Latin letter
  return /[a-zA-Z]/.test(trimmed);
}

/** Validator for Vietnamese source */
function isValidVietnameseCaption(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_LATIN_CAPTION_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  if (UI_NOISE.has(lower)) return false;
  // Vietnamese uses Latin + diacritics
  return /[a-zA-Z]/.test(trimmed) || VIETNAMESE_REGEX.test(trimmed);
}

/**
 * Returns the appropriate caption validator for the given source language.
 * Used by captionDetector so the DOM scan only returns text in the right language.
 */
export function getValidator(sourceLanguage: string): (text: string) => boolean {
  switch (sourceLanguage) {
    case 'English':    return isValidEnglishCaption;
    case 'Vietnamese': return isValidVietnameseCaption;
    default:           return isValidCaption; // Japanese / Chinese / Korean
  }
}
