// Detect Japanese characters: Hiragana, Katakana, CJK Kanji
const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/;
// Detect Vietnamese characters (diacritics specific to Vietnamese)
const VIETNAMESE_REGEX = /[\u00C0-\u024F\u1EA0-\u1EF9]/;

export function containsJapanese(text: string): boolean {
  return JAPANESE_REGEX.test(text);
}

// Minimum meaningful caption length
const MIN_CAPTION_LENGTH = 3;
const MIN_LATIN_CAPTION_LENGTH = 5;

// UI labels to ignore (Google Meet)
const UI_NOISE = [
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
];

/** Validator for Japanese / Chinese / Korean source (requires CJK chars) */
export function isValidCaption(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_CAPTION_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  if (UI_NOISE.some((n) => lower === n)) return false;
  return JAPANESE_REGEX.test(trimmed);
}

/** Validator for English source (Latin text + noise filter) */
function isValidEnglishCaption(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_LATIN_CAPTION_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  if (UI_NOISE.some((n) => lower === n)) return false;
  // Must contain at least one Latin letter
  return /[a-zA-Z]/.test(trimmed);
}

/** Validator for Vietnamese source */
function isValidVietnameseCaption(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_LATIN_CAPTION_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  if (UI_NOISE.some((n) => lower === n)) return false;
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
