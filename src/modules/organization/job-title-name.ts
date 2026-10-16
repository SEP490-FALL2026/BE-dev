/** A job title is at most this many characters after normalization (T-12). */
export const JOB_TITLE_NAME_MAX_LENGTH = 100;

/**
 * Every character JavaScript's `\s` means, written out. The database migration spells out the same set, so
 * the two agree whatever the database locale is: PostgreSQL's own `[[:space:]]` does not cover the no-break
 * and ideographic spaces people paste in.
 */
const WHITESPACE = '[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]';
const EDGES = new RegExp(`^${WHITESPACE}+|${WHITESPACE}+$`, 'g');
const RUNS = new RegExp(`${WHITESPACE}+`, 'g');

/**
 * The name as it is shown (T-12): accents composed (NFC), the ends trimmed, and every run of whitespace
 * inside collapsed to one space. The case is kept.
 */
export function displayJobTitleName(raw: string): string {
  return raw.normalize('NFC').replace(EDGES, '').replace(RUNS, ' ');
}

/**
 * The name as it is compared (T-12, US-02-07 AC-2): the display name in lower case, independent of locale.
 * It ignores case and whitespace but keeps the diacritics and does not guess a spelling, so `Kế toán` and
 * `Ke toan`, or `Desginer` and `Designer`, stay different titles.
 */
export function normalizeJobTitleName(raw: string): string {
  return displayJobTitleName(raw).toLowerCase();
}

/** Counts characters, not UTF-16 units, of the display name. */
export function isJobTitleNameTooLong(raw: string): boolean {
  return [...displayJobTitleName(raw)].length > JOB_TITLE_NAME_MAX_LENGTH;
}
