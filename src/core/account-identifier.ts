/**
 * The names of accounts at a vendor (`US-02-05`, `QĐ-43c`): how two spellings are told to be the same account, what is
 * never a name, and what makes an account the company's (`FR-2.9`). Pure: no I/O, so the preview of an import and the
 * write judge with the same code.
 */

/** Public mail providers: an address there is never a company account, even if a person's work email was entered with it. */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.com.vn',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'zoho.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
]);

/** Trimmed, in a compatible character form and lower case: ` CI-Bot ` and `ci-bot` are one account. */
export function normalizeAccountIdentifier(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase();
}

/** True when the identifier holds a space, a control character or an invisible one: a name has none. */
export function hasInvalidCharacters(identifier: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\s\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/u.test(identifier);
}

const SECRET_SHAPES: readonly RegExp[] = [
  /^gh[pousr]_/i,
  /^github_pat_/i,
  /^glpat-/i,
  /^xox[abprs]-/i,
  /^sk-[A-Za-z0-9_-]{20,}$/,
  /^AKIA[0-9A-Z]{16}$/,
  /^AIza[0-9A-Za-z_-]{30,}$/,
];

/** True when the identifier has the shape of a token or a key a vendor issues: it is a secret, not an account name. */
export function looksLikeSecret(identifier: string): boolean {
  const trimmed = identifier.trim();

  return SECRET_SHAPES.some((shape) => shape.test(trimmed));
}

/** The lower-case domain of something that looks like one email address, or null. */
export function emailDomainOf(identifier: string): string | null {
  const normalized = normalizeAccountIdentifier(identifier);
  const parts = normalized.split('@');
  if (parts.length !== 2 || parts[0].length === 0) return null;
  const domain = parts[1];
  if (
    domain.length === 0 ||
    !domain.includes('.') ||
    domain.startsWith('.') ||
    domain.endsWith('.') ||
    domain.includes('..')
  ) {
    return null;
  }

  return domain;
}

/**
 * True when the identifier is an email on a domain of the company: the domain, or a subdomain of it, is one of
 * `companyDomains`, and is not a free mail provider.
 */
export function isCompanyAccount(identifier: string, companyDomains: readonly string[]): boolean {
  const domain = emailDomainOf(identifier);
  if (!domain || FREE_MAIL_DOMAINS.has(domain)) return false;

  return companyDomains.some((company) => {
    const own = company.toLowerCase();

    return !FREE_MAIL_DOMAINS.has(own) && (domain === own || domain.endsWith(`.${own}`));
  });
}
