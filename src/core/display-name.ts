/**
 * Every character JavaScript's `\s` means, written out. The job-title migration (`20261016130000_job_title_lifecycle`)
 * spells out the same set, so the two agree whatever the database locale is: PostgreSQL's own `[[:space:]]` does not
 * cover the no-break and ideographic spaces people paste in.
 */
const WHITESPACE = '[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]';
const EDGES = new RegExp(`^${WHITESPACE}+|${WHITESPACE}+$`, 'g');
const RUNS = new RegExp(`${WHITESPACE}+`, 'g');

/**
 * A name as it is shown and stored (T-12): accents composed (NFC), the ends trimmed, and every run of whitespace
 * inside collapsed to one space. The case is kept; how names are compared is the owning module's rule.
 */
export function normalizeDisplayName(raw: string): string {
  return raw.normalize('NFC').replace(EDGES, '').replace(RUNS, ' ');
}
