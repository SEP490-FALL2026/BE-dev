import { searchKey } from '../../../core/search-key';
/** One service line of the dictionary with what is needed to recognise it. Pure data: no repo, no Prisma row. */
export interface MatchableLine {
  lineId: string;
  lineName: string;
  groupId: string;
  groupName: string;
  /** Domains of the line, subdomains included (`figma.com` also covers `app.figma.com`). */
  domains: string[];
  /** Literal fragments of a bank description (`PAYPAL*CANVA`), compared ignoring case and spacing. */
  patterns: string[];
  /** Brand domains of the group, a fallback that offers every line of the group. */
  groupDomains: string[];
}

export type VendorMatchMethod = 'DOMAIN' | 'PATTERN' | 'NAME';

export { searchKey };

const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** The host inside a domain or a URL (no scheme, credentials, port, path or leading `www.`), or null if there is none. */
export function normalizeHost(input: string): string | null {
  let text = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  text = text.split(/[/?#]/, 1)[0];
  text = text.slice(text.lastIndexOf('@') + 1).replace(/:\d+$/, '');
  text = text.replace(/^www\./, '');

  return HOST.test(text) ? text : null;
}

const holds = (domains: string[], host: string): boolean =>
  domains.some((domain) => host === domain || host.endsWith(`.${domain}`));

/**
 * The lines a host belongs to: first by the domain of a line itself; only when no line has it, by the brand domain of a
 * group, which offers every line of that group (it cannot say which).
 */
export function matchDomain(input: string, lines: MatchableLine[]): MatchableLine[] {
  const host = normalizeHost(input);
  if (host === null) return [];

  const byLine = lines.filter((line) => holds(line.domains, host));

  return byLine.length > 0 ? byLine : lines.filter((line) => holds(line.groupDomains, host));
}

/**
 * The lines whose pattern occurs in a bank description. Patterns are literal text, never expressions. The longest
 * matching pattern wins; lines tied on that length are all kept.
 */
export function matchDescription(text: string, lines: MatchableLine[]): MatchableLine[] {
  const description = searchKey(text);
  const longest = (line: MatchableLine): number =>
    Math.max(
      0,
      ...line.patterns
        .map(searchKey)
        .map((pattern) => (pattern !== '' && description.includes(pattern) ? pattern.length : 0)),
    );
  const scored = lines.map((line) => ({ line, length: longest(line) })).filter((entry) => entry.length > 0);
  const best = Math.max(0, ...scored.map((entry) => entry.length));

  return scored.filter((entry) => entry.length === best).map((entry) => entry.line);
}

const MIN_QUERY = 2;
const MIN_CONTAINED_NAME = 3;

/**
 * The lines a typed name could mean, in tiers: the line named exactly so, else the group named so (all its lines), else
 * names that contain the query, else names the query contains. The first tier that has any wins; none is chosen for
 * the caller. Ties are listed by line name.
 */
export function matchName(query: string, lines: MatchableLine[]): MatchableLine[] {
  const key = searchKey(query);
  if (key.length < MIN_QUERY) return [];

  const tiers: Array<(line: MatchableLine) => boolean> = [
    (line) => searchKey(line.lineName) === key,
    (line) => searchKey(line.groupName) === key,
    (line) => searchKey(line.lineName).includes(key) || searchKey(line.groupName).includes(key),
    (line) =>
      [line.lineName, line.groupName].some((name) => {
        const nameKey = searchKey(name);

        return nameKey.length >= MIN_CONTAINED_NAME && key.includes(nameKey);
      }),
  ];
  for (const test of tiers) {
    const found = lines.filter(test);
    if (found.length > 0) {
      return [...found].sort((a, b) => a.lineName.localeCompare(b.lineName) || a.lineId.localeCompare(b.lineId));
    }
  }

  return [];
}
