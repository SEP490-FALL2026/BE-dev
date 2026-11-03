/**
 * The key a name is compared by: accents removed, lower case, blanks trimmed and collapsed. "Fígma  Inc" and
 * "figma inc" have the same key. Pure text, shared by every module that keeps names unique ignoring case and accents.
 */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escapes the characters that mean something in a SQL LIKE / ILIKE pattern, for a query written with ESCAPE '\\'. */
export function escapeLikePattern(term: string): string {
  return term.replace(/([%_\\])/g, '\\$1');
}
