import type { MatchMethod, RowOutcome } from '../vendor-import.types';

/** What is known of the people an identifier may be, by each step of the order of the match (`FR-4.5`, `QT 5.2`). */
export interface IdentifierFacts {
  /** The mapping in force (step 1): who and how it was made. */
  mapping: { employeeId: string; method: MatchMethod } | null;
  /** Whether a mapping of the identifier was ended by the IT Admin: with none in force, only a mapping made by hand ties it again. */
  mappingEnded?: boolean;
  /** The people whose work email is the identifier, those who left included (step 2). */
  emailHits: readonly string[];
  /** The people who hold, or held, a seat of the application under the identifier as an account (step 2). */
  accountHits: readonly string[];
  /** The people found by the rule of aliases: the email without its `+tag`, or on the domain of the company (step 3). */
  aliasHits: readonly string[];
}

export interface IdentityJudgement {
  outcome: Extract<RowOutcome, 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS'>;
  employeeId: string | null;
  method: MatchMethod | null;
  confidence: 'HIGH' | 'MEDIUM' | null;
  /** The people an ambiguous identifier fits. */
  candidates: string[];
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)].sort();

/**
 * Tells who an identifier is, in the order of the system (`FR-4.5`, `FR-4.6`): the mapping in force; else nobody when a mapping of it was
 * ended; else the work email or the account identifier exactly (high confidence); else the rule of aliases (medium). More than one person at a step is ambiguous, never a guess;
 * nobody is not found. An identifier is one person: two identifiers may be the same person, but one is never two.
 */
export function judgeIdentity(facts: IdentifierFacts): IdentityJudgement {
  if (facts.mapping) {
    return {
      outcome: 'MATCHED',
      employeeId: facts.mapping.employeeId,
      method: facts.mapping.method,
      confidence: facts.mapping.method === 'ALIAS_RULE' ? 'MEDIUM' : 'HIGH',
      candidates: [],
    };
  }
  // A mapping the IT Admin ended said the system was wrong: the same steps would make it again, so it waits in the queue for a person.
  if (facts.mappingEnded)
    return { outcome: 'UNMATCHED', employeeId: null, method: null, confidence: null, candidates: [] };
  const exact = unique([...facts.emailHits, ...facts.accountHits]);
  if (exact.length === 1) {
    return {
      outcome: 'MATCHED',
      employeeId: exact[0],
      method: facts.emailHits.length > 0 ? 'EXACT_EMAIL' : 'ACCOUNT_IDENTIFIER',
      confidence: 'HIGH',
      candidates: [],
    };
  }
  if (exact.length > 1)
    return { outcome: 'AMBIGUOUS', employeeId: null, method: null, confidence: null, candidates: exact };

  const alias = unique(facts.aliasHits);
  if (alias.length === 1) {
    return { outcome: 'MATCHED', employeeId: alias[0], method: 'ALIAS_RULE', confidence: 'MEDIUM', candidates: [] };
  }
  if (alias.length > 1)
    return { outcome: 'AMBIGUOUS', employeeId: null, method: null, confidence: null, candidates: alias };

  return { outcome: 'UNMATCHED', employeeId: null, method: null, confidence: null, candidates: [] };
}

/**
 * Domains anyone can open a mailbox on: never a domain of the company for the rule of aliases, even when someone's work email is on one,
 * since the same local part there is not the same person.
 */
const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
]);

/**
 * The emails the rule of aliases tries for an email identifier: without the `+tag` of its local part on its own domain and, only when that
 * domain is itself a domain of the company, the same local part on each other domain of the company (an old domain of the vendor account). An
 * address on a domain outside the company is never tied to a person of the company by its local part (`FR-4.5`, `TC-2`). The identifier
 * itself is not among them (it was tried exactly).
 */
export function aliasVariants(normalized: string, companyDomains: readonly string[]): string[] {
  const parts = normalized.split('@');
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') return [];
  const [local, domain] = parts;
  const base = local.split('+')[0];
  if (base === '') return [];
  const company = companyDomains.filter((candidate) => !PUBLIC_EMAIL_DOMAINS.has(candidate));
  const domains = company.includes(domain) ? unique([domain, ...company]) : [domain];

  return domains.map((candidate) => `${base}@${candidate}`).filter((variant) => variant !== normalized);
}

/** Whether the identifier can be a work email: one `@` between two non-empty parts. */
export function looksLikeEmail(normalized: string): boolean {
  const parts = normalized.split('@');

  return parts.length === 2 && parts[0] !== '' && parts[1].includes('.');
}
