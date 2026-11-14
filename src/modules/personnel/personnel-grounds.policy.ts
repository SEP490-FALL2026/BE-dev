import { type BusinessDate, fromDateColumn, isBusinessDate } from '../../core/business-date';

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

/**
 * The basis as a personnel event keeps it (`QĐ-110a`, `QĐ-111bd`): one box of words, in `reference`, and the other three parts all
 * present (an event written before the box) or all absent. Only the box is asked of a new event.
 */
export interface RecordedGrounds {
  type: string | null;
  reference: string;
  issuer: string | null;
  issuedOn: BusinessDate | null;
}

/** The columns of a basis as a table of events holds them. */
export interface GroundsColumns {
  groundsType: string | null;
  groundsReference: string;
  groundsIssuer: string | null;
  groundsIssuedOn: Date | null;
}

/** The basis a row keeps, in the form the records of events share. */
export function recordedGroundsOf(row: GroundsColumns): RecordedGrounds {
  return {
    type: row.groundsType,
    reference: row.groundsReference,
    issuer: row.groundsIssuer,
    issuedOn: row.groundsIssuedOn ? fromDateColumn(row.groundsIssuedOn) : null,
  };
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
export function groundsSnapshot(grounds: RecordedGrounds): { [part: string]: string | null } {
  return { type: grounds.type, reference: grounds.reference, issuer: grounds.issuer, issuedOn: grounds.issuedOn };
}

/** The most characters of the box that holds the basis of an event. */
export const GROUNDS_NOTE_MAX_LENGTH = 500;

export type GroundsNoteRefusal =
  { reason: 'GROUNDS_REQUIRED' } | { reason: 'GROUNDS_TOO_LONG' } | { reason: 'GROUNDS_IS_NOTICE' };

/**
 * Null when the box is filled, is no longer than 500 characters once trimmed, and is not only the code of a notice (a notice starts a
 * process, it is not the document that ends it, as for the four-part basis); otherwise what is wrong with it.
 */
export function groundsNoteRefusal(note: string | null | undefined): GroundsNoteRefusal | null {
  const text = (note ?? '').trim();
  if (text === '') return { reason: 'GROUNDS_REQUIRED' };
  if (text.length > GROUNDS_NOTE_MAX_LENGTH) return { reason: 'GROUNDS_TOO_LONG' };
  if (NOTICE_CODE.test(text)) return { reason: 'GROUNDS_IS_NOTICE' };

  return null;
}

/**
 * The box a four-part basis becomes where that form is still the input (the notice of a head that is turned into an event, the
 * controlled procedure): the parts given, in the order a document is read ("DECISION QD-12/2026 — HR Department, 2026-06-20"), cut to
 * the size of the box. Undefined when no part is given, so the box refuses it as missing.
 */
export function groundsNoteOfBasis(basis: GroundsInput | { note: string } | null | undefined): string | undefined {
  if (basis && 'note' in basis) {
    const text = basis.note.trim();

    return text === '' ? undefined : text.slice(0, GROUNDS_NOTE_MAX_LENGTH);
  }
  if (!basis) return undefined;
  const part = (value: string | null | undefined): string => (filled(value) ? value.trim() : '');
  const document = [part(basis.type), part(basis.reference)].filter(Boolean).join(' ');
  const source = [part(basis.issuer), part(basis.issuedOn)].filter(Boolean).join(', ');
  const note = [document, source].filter(Boolean).join(' — ');

  return note === '' ? undefined : note.slice(0, GROUNDS_NOTE_MAX_LENGTH);
}

/**
 * The box a recorded basis is read as, for the wire (`R-32`): the reference as written for an event made with the box; for an event written
 * before it, which kept four parts, the parts put back into one sentence (as `groundsNoteOfBasis` writes them) so that the kind of
 * document, who issued it and the day are not lost from what the interface shows.
 */
export function groundsNoteOf(recorded: RecordedGrounds): string {
  if (recorded.type === null) return recorded.reference;

  return groundsNoteOfBasis(recorded) ?? recorded.reference;
}

/** The box as it is kept, trimmed, with the other three parts empty; call only after `groundsNoteRefusal` said it is fine. */
export function normalizedGroundsNote(note: string): RecordedGrounds {
  return { type: null, reference: note.trim(), issuer: null, issuedOn: null };
}
