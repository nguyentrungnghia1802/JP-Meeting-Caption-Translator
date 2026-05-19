// Detect Japanese characters: Hiragana, Katakana, CJK Kanji
const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/;

export function containsJapanese(text: string): boolean {
  return JAPANESE_REGEX.test(text);
}

// Minimum meaningful caption length
const MIN_CAPTION_LENGTH = 3;

// UI labels to ignore
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
];

export function isValidCaption(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_CAPTION_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  if (UI_NOISE.some((n) => lower === n)) return false;
  return containsJapanese(trimmed);
}
