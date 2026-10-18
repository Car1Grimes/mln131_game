/**
 * Normalize an answer for comparison:
 * - Unicode compatibility decomposition, then strip combining marks (Vietnamese diacritics)
 * - đ/Đ -> d (đ is not decomposable, so it is mapped explicitly)
 * - Unicode case-insensitive
 * - drop everything that is not a letter or digit (whitespace, punctuation, underscores, hyphens, symbols)
 * No synonyms or alternative wordings are ever accepted.
 */
export function normalizeAnswer(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Exact match after normalization only. */
export function isCorrectAnswer(submitted: string, canonical: string): boolean {
  const s = normalizeAnswer(submitted);
  return s.length > 0 && s === normalizeAnswer(canonical);
}

/** Split an answer into words of displayable characters (punctuation removed). */
export function answerLetterGroups(answer: string): string[][] {
  return answer
    .normalize('NFC')
    .split(/\s+/)
    .map((word) => Array.from(word).filter((ch) => /[\p{L}\p{N}]/u.test(ch)))
    .filter((word) => word.length > 0);
}

/** Letters per word: safe to send to players during a round (reveals length, not content). */
export function answerPattern(answer: string): number[] {
  return answerLetterGroups(answer).map((w) => w.length);
}
