export class InvalidEmailError extends Error {
  constructor() {
    super('The email address is not valid.');
    this.name = 'InvalidEmailError';
  }
}

const MAX_LENGTH = 254;
// Deliberately conservative: one @, a dotted domain, no whitespace. Deliverability is not checked.
const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Canonical form used for every identity comparison: trimmed, lower-cased, and with any
 * `+tag` removed from the local part (FR-7.6, US-02-01 AC-6). The result is for matching and
 * uniqueness only; the address as the person wrote it is stored separately.
 */
export function normalizeEmail(input: string): string {
  const value = input.trim().toLowerCase();
  if (value.length === 0 || value.length > MAX_LENGTH || !SHAPE.test(value)) throw new InvalidEmailError();

  const [local, domain] = value.split('@');
  const base = local.split('+')[0];
  if (base.length === 0) throw new InvalidEmailError();

  return `${base}@${domain}`;
}
