import { isIP } from 'node:net';

export type DatabaseHostKind = 'loopback' | 'not-loopback' | 'invalid';

/** Query parameters the PostgreSQL client connects to instead of the host of the URL. */
const HOST_OVERRIDES = ['host', 'hostaddr'];

/**
 * Whether a PostgreSQL URL points at this machine (operational-commands rule 2). Decided by the parsed host, never by
 * a substring: `localhost`, an IPv4 address in 127.0.0.0/8 or the IPv6 loopback `::1`. A host override in the query, a
 * list of hosts, an empty host, a Docker service name, any other name or address is `not-loopback`; a value that is not
 * a `postgres:`/`postgresql:` URL is `invalid`. `postgresql:` is not a special scheme for the URL parser, so the host
 * keeps its case and is lowercased here.
 */
export function classifyDatabaseUrl(value: string): DatabaseHostKind {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'invalid';
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return 'invalid';
  if (HOST_OVERRIDES.some((name) => url.searchParams.has(name))) return 'not-loopback';

  const host = url.hostname.toLowerCase();
  if (host === '' || host.includes(',')) return 'not-loopback';
  if (host === 'localhost') return 'loopback';

  const address = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isIP(address) === 4) return address.split('.')[0] === '127' ? 'loopback' : 'not-loopback';
  if (isIP(address) === 6) return address === '::1' ? 'loopback' : 'not-loopback';

  return 'not-loopback';
}
