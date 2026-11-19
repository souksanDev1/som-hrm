/** Lao pre-posed vowels are written before the consonant they follow, so they are never an initial on their own. */
const PREPOSED_VOWELS = 'ເແໂໃໄ';

/** First letter of a person's name for an avatar: a leading pre-posed Lao vowel is skipped for the consonant after it. */
export const nameInitial = (name: string): string => {
  const chars = Array.from(name.trim());
  if (chars.length === 0) return '';
  const first = chars[0]!;
  return PREPOSED_VOWELS.includes(first) && chars.length > 1 ? chars[1]! : first;
};
