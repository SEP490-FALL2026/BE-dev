import { normalizeDisplayName } from '../../../core/display-name';
import { normalizeHost } from '../vendor-dictionary/vendor-matcher.policy';
import {
  ApplicationDomainInvalidError,
  ApplicationInternalHasNoVendorError,
  ApplicationNameInvalidError,
  ApplicationNoteInvalidError,
  ApplicationTooManyDomainsError,
  ApplicationVendorNameInvalidError,
  ApplicationVendorRequiredError,
  ApplicationVendorSourceAmbiguousError,
} from './application.errors';

export const MAX_NAME_LENGTH = 200;
export const MAX_DOMAINS = 20;
export const MAX_NOTE_LENGTH = 1000;

/** The answers to the three classification questions (ADR-10). Comments, notes and design reviews are not messaging. */
export interface CommunicationAnswers {
  personToPersonMessaging: boolean;
  callsOrMeetings: boolean;
  mailbox: boolean;
}

/** The communication-service flag: "yes" to any of the three questions. */
export function isCommunicationService(answers: CommunicationAnswers): boolean {
  return answers.personToPersonMessaging || answers.callsOrMeetings || answers.mailbox;
}

/** The most similar applications a detail names; the total says how many there are (`LD-06`). */
export const SIMILAR_APPLICATION_LIMIT = 20;

/** A communication service is not collected for usage by default (BR-06.2); otherwise nothing is decided here. */
export function usageCollectionDefault(communicationService: boolean): 'NOT_COLLECTED' | null {
  return communicationService ? 'NOT_COLLECTED' : null;
}

function cleanText(raw: string, onInvalid: () => Error): string {
  const text = normalizeDisplayName(raw);
  if (text.length < 1 || text.length > MAX_NAME_LENGTH) throw onInvalid();

  return text;
}

/** An application name as it is shown: trimmed, blanks collapsed, 1 to 200 characters. */
export function cleanApplicationName(raw: string): string {
  return cleanText(raw, () => new ApplicationNameInvalidError());
}

/** Each value reduced to its host; repeats dropped, order kept; at most twenty. */
export function cleanApplicationDomains(values: readonly string[]): string[] {
  const hosts = new Set<string>();
  for (const value of values) {
    const host = normalizeHost(value);
    if (host === null) throw new ApplicationDomainInvalidError(value);
    hosts.add(host);
  }
  if (hosts.size > MAX_DOMAINS) throw new ApplicationTooManyDomainsError();

  return [...hosts];
}

/** The free-text note beside the three answers: nothing or blanks is null; at most 1000 characters. */
export function cleanNote(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const note = normalizeDisplayName(raw);
  if (note.length > MAX_NOTE_LENGTH) throw new ApplicationNoteInvalidError();

  return note === '' ? null : note;
}

export type VendorSource = { type: 'NONE' } | { type: 'DICTIONARY'; lineId: string } | { type: 'NAME'; name: string };

/**
 * Where the vendor of a new application comes from. An internal application has no vendor; any other names its vendor either through a dictionary service line (the vendor is
 * the line's group) or by typing a name for software outside the dictionary — exactly one of the two.
 */
export function vendorSourceOf(input: {
  kind: 'SAAS' | 'LICENSED' | 'INTERNAL';
  vendorName?: string;
  dictionaryServiceLineId?: string;
}): VendorSource {
  const named = input.vendorName !== undefined;
  const lined = input.dictionaryServiceLineId !== undefined;

  if (input.kind === 'INTERNAL') {
    if (named || lined) throw new ApplicationInternalHasNoVendorError();

    return { type: 'NONE' };
  }
  if (named && lined) throw new ApplicationVendorSourceAmbiguousError();
  if (lined) return { type: 'DICTIONARY', lineId: input.dictionaryServiceLineId as string };
  if (named)
    return { type: 'NAME', name: cleanText(input.vendorName as string, () => new ApplicationVendorNameInvalidError()) };

  throw new ApplicationVendorRequiredError();
}

/**
 * Whether the Business Owner has to be replaced: they have left (`US-04-06`, `FR-1.7`). Only the employee status counts, so
 * a move to another department, which leaves it `ACTIVE`, never raises it. Read when the application is read, not stored.
 */
export function replacementRequired(ownerStatus: 'ACTIVE' | 'TERMINATED'): boolean {
  return ownerStatus === 'TERMINATED';
}
