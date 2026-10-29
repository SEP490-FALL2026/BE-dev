import { createHash } from 'node:crypto';
import { groundsRefusal } from '../policies/grounds.policy';
import { SuperAdminEventRefusedError } from '../public/super-admin-event.errors';
import type {
  SuperAdminEventContext,
  SuperAdminEventModeName,
  SuperAdminEventParameters,
} from '../public/super-admin-event.types';

/** The same pattern as the ticket of `ops:recover`: whatever the approval system calls the ticket; the key that makes a re-run a no-op. */
const TICKET_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,99}$/;
/** A reference to a person or a document is a short written reference, not prose and not data. */
const FREE_TEXT_REFERENCE = /^[\x20-\x7e¡-￿]{2,100}$/;

/** Without case and without spaces: how a reference is compared with the identifiers of the person. */
const squash = (value: string): string => value.replace(/\s+/g, '').toLowerCase();

/**
 * What needs no database, judged before anything is opened (spec L.2): the ticket has the shape of one, the two references are short
 * written references, the basis is whole (a part missing is `BASIS_INVALID`; the code of a notice is refused later, by the event, with
 * its own code), and in `SHARED` the person who runs the command is not the person who approved it. `LOCAL_TEST` lets one person do
 * both; the Audit Trail records the environment.
 */
export function assertContext(context: SuperAdminEventContext): void {
  if (!TICKET_REFERENCE.test(context.ticketRef)) throw new SuperAdminEventRefusedError('TICKET_REFERENCE_INVALID');
  if (!FREE_TEXT_REFERENCE.test(context.approvedBy) || !FREE_TEXT_REFERENCE.test(context.operator)) {
    throw new SuperAdminEventRefusedError('TICKET_REFERENCE_INVALID');
  }
  const basis = groundsRefusal(context.basis);
  if (basis && basis.reason !== 'GROUNDS_IS_NOTICE') throw new SuperAdminEventRefusedError('BASIS_INVALID');
  if (context.environment === 'SHARED' && squash(context.approvedBy) === squash(context.operator)) {
    throw new SuperAdminEventRefusedError('APPROVER_IS_OPERATOR');
  }
}

/** How the person the event is about is known to the system: the identifiers a reference must not match. */
export interface SubjectIdentifiers {
  employeeCode: string;
  loginEmail: string | null;
  workEmail: string | null;
}

/**
 * The split of persons, in every environment (spec L.2): neither the person who runs the command nor the person who approved it is
 * the person the event is about, by employee code, login email or work email. Without case and without spaces.
 */
export function assertSplit(context: SuperAdminEventContext, subject: SubjectIdentifiers): void {
  const identifiers = [subject.employeeCode, subject.loginEmail, subject.workEmail]
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map(squash);
  if (identifiers.includes(squash(context.operator))) throw new SuperAdminEventRefusedError('OPERATOR_IS_SUBJECT');
  if (identifiers.includes(squash(context.approvedBy))) throw new SuperAdminEventRefusedError('APPROVER_IS_SUBJECT');
}

/** The kinds of notice of a head that each recording mode may come from (`--from-notice`): the kind decides what is recorded. */
const NOTICE_KINDS: Partial<Record<SuperAdminEventModeName, readonly string[]>> = {
  'transfer-record': ['DEPARTMENT_TRANSFER_OUT', 'DEPARTMENT_TRANSFER_IN'],
  'leave-start': ['LONG_LEAVE'],
  'departure-record': ['DEPARTURE'],
  'abrupt-departure-record': ['ABRUPT_DEPARTURE'],
};

/** Whether the notice is of the kind the mode records; a notice would otherwise be recorded as an event the mode never asked for. */
export const noticeKindFitsMode = (mode: SuperAdminEventModeName, kind: string): boolean =>
  NOTICE_KINDS[mode]?.includes(kind) ?? false;

/** Keys sorted at every level, so the same parameters are always the same text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

/**
 * The SHA-256 of the parameters of the mode, normalized (spec L.2): the mode and its own parameters, the person and the basis. The
 * approver, the operator and the environment are not in it: the same ticket run again by someone else with the same parameters is the
 * same run. A different digest under the same ticket is `TICKET_PARAMETERS_DIFFER`.
 */
export function parametersDigest(
  context: Pick<SuperAdminEventContext, 'subjectCode' | 'basis'>,
  parameters: SuperAdminEventParameters,
): string {
  return createHash('sha256')
    .update(canonical({ subject: squash(context.subjectCode), basis: context.basis, parameters }))
    .digest('hex');
}
