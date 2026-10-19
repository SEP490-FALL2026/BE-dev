import { normalizeDisplayName } from '../../core/display-name';

/** A job title is at most this many characters after normalization (T-12). */
export const JOB_TITLE_NAME_MAX_LENGTH = 100;

/**
 * The name as it is compared (T-12, US-02-07 AC-2): the display name in lower case, independent of locale.
 * It ignores case and whitespace but keeps the diacritics and does not guess a spelling, so `Kế toán` and
 * `Ke toan`, or `Desginer` and `Designer`, stay different titles.
 */
export function normalizeJobTitleName(raw: string): string {
  return normalizeDisplayName(raw).toLowerCase();
}

/** Counts characters, not UTF-16 units, of the display name. */
export function isJobTitleNameTooLong(raw: string): boolean {
  return [...normalizeDisplayName(raw)].length > JOB_TITLE_NAME_MAX_LENGTH;
}
