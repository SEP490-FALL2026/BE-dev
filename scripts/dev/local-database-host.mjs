import { isIP } from 'node:net';

/** Same parsed-host judgement as the application; query host overrides never count as loopback. */
export function classifyDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return 'invalid';
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return 'invalid';
  if (['host', 'hostaddr'].some((key) => url.searchParams.has(key))) return 'not-loopback';
  const host = url.hostname.toLowerCase();
  if (host === 'localhost') return 'loopback';
  const address = host.startsWith('[') ? host.slice(1, -1) : host;
  if (isIP(address) === 4 && address.split('.')[0] === '127') return 'loopback';
  if (isIP(address) === 6 && address === '::1') return 'loopback';
  return 'not-loopback';
}
