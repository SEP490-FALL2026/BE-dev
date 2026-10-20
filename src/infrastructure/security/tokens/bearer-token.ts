/**
 * The access token of an `Authorization: Bearer <token>` header (AUTH.1 / F-18). The scheme is case-insensitive
 * (RFC 9110 §11.1: `Bearer`, `bearer`, `BEARER`); everything else is exact: one space, then a token without whitespace.
 * The `i` flag affects only the scheme letters; the token class `[^\s]` has no case.
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const match = /^bearer ([^\s]+)$/i.exec(header);
  return match?.[1] ?? null;
}
