import { searchKey } from '../../../core/search-key';

/** What the duplicate check needs to know of an entry of the catalog; `domains` are hosts as the catalog stores them (no scheme, path or `www.`). */
export interface CatalogEntryFacts {
  id: string;
  name: string;
  domains: readonly string[];
}

export type DuplicateBy = 'NAME' | 'DOMAIN';

/**
 * The entry the same software already has in the catalog, by the name (case, accents and spacing ignored) or by a domain the candidate shares
 * with it (`QĐ-111b`): one rule for the IT Admin who declares an application and for the employee who proposes software outside the catalog.
 * The name is judged first. The candidate's `domains` are hosts, as the entries'; the first entry in the order given that matches wins.
 */
export function duplicateOf(
  candidate: { name: string; domains: readonly string[] },
  entries: readonly CatalogEntryFacts[],
): { entry: CatalogEntryFacts; by: DuplicateBy } | null {
  const key = searchKey(candidate.name);
  const byName = entries.find((entry) => searchKey(entry.name) === key);
  if (byName) return { entry: byName, by: 'NAME' };

  const hosts = new Set(candidate.domains);
  const byDomain = entries.find((entry) => entry.domains.some((domain) => hosts.has(domain)));

  return byDomain ? { entry: byDomain, by: 'DOMAIN' } : null;
}
