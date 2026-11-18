/**
 * The `Content-Disposition` of a download (`SEC-01`, `SEC-07`): always `attachment`, so a browser saves the file and never
 * renders it, with the name in the plain form for old clients and in the `filename*` form (RFC 6266, RFC 5987) for the
 * real one. Nothing in a file name can end the header or start another.
 */
export function attachmentDisposition(fileName: string): string {
  const printable = [...fileName].filter((character) => character >= ' ' && character !== '\u007f').join('');
  const fallback = printable.replace(/[^\x20-\x7e]|["\\;%]/g, '_').trim() || 'file';
  const encoded = encodeURIComponent(printable).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
