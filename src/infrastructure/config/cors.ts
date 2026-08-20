export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function validateProductionCorsOrigins(origins: readonly string[]): void {
  if (origins.length === 0 || origins.includes('*') || origins.some((origin) => !isExactHttpsOrigin(origin))) {
    throw new Error('Environment validation failed: CORS_ORIGINS must be a non-empty HTTPS allow-list in production');
  }
}

function isExactHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      url.pathname === '/' &&
      url.origin === value
    );
  } catch {
    return false;
  }
}
