import { type BusinessDate, isBusinessDate } from '../../../core/business-date';

/**
 * The authoritative basis a change of the place of a person rests on (`US-03-01` AC-18): the kind of document, its number or a
 * reference to the file, who issued it and when. Only the reference is kept; the file itself is not (there is no shared place to
 * upload it yet). What is said here is shared by every personnel flow that needs one (a transfer, later a leaving).
 */
export interface Grounds {
  type: string;
  reference: string;
  issuer: string;
  issuedOn: BusinessDate;
}

/** What a caller sent for the basis: every part may be missing, and the policy says which. */
export type GroundsInput = { [Part in keyof Grounds]?: string | null };

export type GroundsRefusal =
  | { reason: 'GROUNDS_REQUIRED' }
  | { reason: 'GROUNDS_INCOMPLETE'; missing: (keyof Grounds)[] }
  | { reason: 'GROUNDS_IS_NOTICE' };

const PARTS: readonly (keyof Grounds)[] = ['type', 'reference', 'issuer', 'issuedOn'];

/**
 * The code a notice of a department head carries (`BM-09`, form `BM09-<year>-<six digits>`): a notice is the start of a
 * process, not the authoritative document that ends it, so it is refused as a basis.
 */
const NOTICE_CODE = /^BM09-\d{4}-\d{6}$/;

const filled = (value: string | null | undefined): value is string => typeof value === 'string' && value.trim() !== '';

/** Null when the basis is whole and is not a notice; otherwise the first thing that is wrong with it. */
export function groundsRefusal(input: GroundsInput | null | undefined): GroundsRefusal | null {
  if (!input || PARTS.every((part) => !filled(input[part]))) return { reason: 'GROUNDS_REQUIRED' };
  const missing = PARTS.filter(
    (part) => !filled(input[part]) || (part === 'issuedOn' && !isBusinessDate(input[part] ?? '')),
  );
  if (missing.length > 0) return { reason: 'GROUNDS_INCOMPLETE', missing };
  if (NOTICE_CODE.test((input.reference ?? '').trim())) return { reason: 'GROUNDS_IS_NOTICE' };

  return null;
}

/** The basis as it is kept, trimmed; call only after `groundsRefusal` said it is whole. */
export function normalizedGrounds(input: GroundsInput): Grounds {
  return {
    type: (input.type ?? '').trim(),
    reference: (input.reference ?? '').trim(),
    issuer: (input.issuer ?? '').trim(),
    issuedOn: (input.issuedOn ?? '').trim(),
  };
}

/** The basis as the Audit Trail keeps it: the four parts and nothing else. */
export function groundsSnapshot(grounds: Grounds): { [part: string]: string } {
  return { type: grounds.type, reference: grounds.reference, issuer: grounds.issuer, issuedOn: grounds.issuedOn };
}
