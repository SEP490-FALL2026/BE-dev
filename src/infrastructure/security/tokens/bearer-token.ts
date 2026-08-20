export function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match?.[1] ?? null;
}
