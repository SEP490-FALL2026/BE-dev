import { addDays, type BusinessDate } from '../../../core/business-date';
import {
  AssignmentNotOpenError,
  ProvisioningTaskNotBeforeError,
  ProvisioningTaskStateError,
  RevocationCompletionError,
  RevocationRefusedError,
  type RevocationCompletionProblem,
} from '../public/licensing.errors';
import {
  REVOCATION_SOURCES,
  type AccessState,
  type AssignmentKind,
  type KeyDisposition,
  type ProvisioningKind,
  type ProvisioningTaskKind,
  type ProvisioningTaskStatus,
  type RevocationCompletion,
  type RevocationSource,
} from '../public/licensing.types';
import { cleanEvidence } from './provisioning.policy';

/** The longest note a completion or a reason keeps; the DTO bounds the request with it. */
export const REVOCATION_NOTE_MAX_LENGTH = 1000;

/** A source says why the seat is revoked, and is one of the twelve (`US-07-05` AC-3, AC-11). Throws RevocationRefusedError. */
export function assertRevocationSource(source: string | undefined): RevocationSource {
  if (!source || !(REVOCATION_SOURCES as readonly string[]).includes(source)) {
    throw new RevocationRefusedError('SOURCE_REQUIRED');
  }

  return source as RevocationSource;
}

/**
 * Whether the seat may be revoked, judged in this order: it is a personal one (a service account is answered for by a person
 * and is not among the rights a departure takes away), it is still open, and its kind of provisioning has a revocation (K1,
 * K2, K4 whose key goes back to the store, K5; K3 is specified only). Throws RevocationRefusedError and AssignmentNotOpenError.
 */
export function assertRevocable(input: {
  kind: AssignmentKind;
  open: boolean;
  provisioningType: ProvisioningKind;
}): void {
  if (input.kind === 'SERVICE') throw new RevocationRefusedError('ASSIGNMENT_IS_SERVICE_ACCOUNT');
  if (!input.open) throw new AssignmentNotOpenError();
  if (input.provisioningType === 'K3') throw new RevocationRefusedError('TYPE_NOT_SUPPORTED', input.provisioningType);
}

/** A revocation is completed as one, and the completion of a grant is not for it. Throws ProvisioningTaskStateError. */
export function assertRevocationTask(kind: ProvisioningTaskKind): void {
  if (kind !== 'REVOKE') throw new ProvisioningTaskStateError('NOT_REVOCATION');
}

/** A revocation with a day not before is not taken or completed before it (`US-10-07` AC-18): the day it can be is told. Throws ProvisioningTaskNotBeforeError. */
export function assertNotBefore(notBefore: BusinessDate | null, today: BusinessDate): void {
  if (notBefore !== null && today < notBefore) throw new ProvisioningTaskNotBeforeError(notBefore);
}

export function assertNotRevocationTask(kind: ProvisioningTaskKind): void {
  if (kind === 'REVOKE') throw new ProvisioningTaskStateError('IS_REVOCATION');
}

/** True when the assignment holds a seat that nobody has ended or failed or cancelled. */
export function isOpenAssignment(assignment: {
  validUntil: BusinessDate | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
}): boolean {
  return assignment.validUntil === null && assignment.failedAt === null && assignment.cancelledAt === null;
}

/** How each kind of provisioning is completed. */
export function completionsFor(type: ProvisioningKind): RevocationCompletion[] {
  switch (type) {
    case 'K1':
      return ['RENEWAL_CANCELLED'];
    case 'K2':
      return ['ACCOUNT_REMOVED', 'ALREADY_GONE'];
    case 'K4':
      return ['KEY_DEACTIVATED'];
    case 'K5':
      return ['OFF_SYSTEM_REVOKED'];
    default:
      return [];
  }
}

export interface CompletionInput {
  completion: RevocationCompletion;
  evidence: string;
  note?: string | undefined;
  paidThroughOn?: BusinessDate | undefined;
  accessState?: AccessState | undefined;
  accessCutOn?: BusinessDate | undefined;
  accessEvidence?: string | undefined;
  /** K4 only, required: where the key goes (`QĐ-111p`). */
  keyDisposition?: KeyDisposition | undefined;
  /** K4 only, with `WITHDRAW`: why the key is withdrawn from the store. */
  withdrawalReason?: string | undefined;
}

/** What is stored of a completion and the day the assignment ends because of it. */
export interface CompletionPlan {
  completion: RevocationCompletion;
  evidence: string;
  note: string | null;
  paidThroughOn: BusinessDate | null;
  accessState: AccessState | null;
  accessCutOn: BusinessDate | null;
  accessEvidence: string | null;
  endOn: BusinessDate;
}

const blankToNull = (raw: string | undefined): string | null => {
  const text = raw?.trim();

  return text ? text : null;
};

function fail(problem: RevocationCompletionProblem): never {
  throw new RevocationCompletionError(problem);
}

/** What becomes of the key of a K4 seat whose revocation is completed. */
export interface KeyReturnPlan {
  disposition: KeyDisposition;
  withdrawalReason: string | null;
}

/**
 * Where the key of the seat goes (`US-07-05` AC-6, AC-7, `QĐ-103d`, `QĐ-111p`): only a K4 seat has one, and the IT Admin must say it: back
 * to the store, or withdrawn from it (a key that may not move to another device), which needs a reason. Null for any other kind, which
 * names neither. A K4 seat granted before the key pool holds no key: nothing is asked and nothing is recorded about one, whatever was sent
 * (Owner 12/11/2026). Throws RevocationCompletionError (`KEY_DISPOSITION_REQUIRED`, `COMPLETION_NOT_ALLOWED`, `WITHDRAWAL_REASON_REQUIRED`).
 */
export function planKeyReturn(input: CompletionInput, type: ProvisioningKind, holdsKey: boolean): KeyReturnPlan | null {
  if (type !== 'K4') {
    if (input.keyDisposition !== undefined || input.withdrawalReason !== undefined) fail('COMPLETION_NOT_ALLOWED');

    return null;
  }
  if (!holdsKey) return null;
  const disposition = input.keyDisposition;
  if (disposition === undefined) fail('KEY_DISPOSITION_REQUIRED');
  const withdrawalReason = blankToNull(input.withdrawalReason);
  if (disposition === 'RETURN_TO_STORE') {
    if (withdrawalReason !== null) fail('COMPLETION_NOT_ALLOWED');

    return { disposition, withdrawalReason: null };
  }
  if (withdrawalReason === null) fail('WITHDRAWAL_REASON_REQUIRED');

  return { disposition, withdrawalReason };
}

/** The day a seat ends at the earliest: its period is never empty, so a seat that began today ends tomorrow (`QĐ` of the spec). */
export function endFloor(startsOn: BusinessDate): BusinessDate {
  return addDays(startsOn, 1);
}

const later = (a: BusinessDate, b: BusinessDate): BusinessDate => (a > b ? a : b);
const earlier = (a: BusinessDate, b: BusinessDate): BusinessDate => (a < b ? a : b);

/**
 * What a completion stores and when the seat ends (`US-07-05` AC-1, AC-4, AC-5, AC-8, AC-19). The way must fit the kind of
 * provisioning; K2 and K5 end the seat today, K1 at the end of the period that was paid or the day the access was cut, whichever
 * is earlier. K1 stores the state of the access always, or nothing is stored. Throws RevocationCompletionError and
 * ProvisioningEvidenceRequiredError.
 */
export function planCompletion(
  input: CompletionInput,
  context: { type: ProvisioningKind; startsOn: BusinessDate; today: BusinessDate },
): CompletionPlan {
  if (!completionsFor(context.type).includes(input.completion)) fail('COMPLETION_NOT_ALLOWED');
  const isRenewal = input.completion === 'RENEWAL_CANCELLED';
  const hasAccessFields =
    input.paidThroughOn !== undefined ||
    input.accessState !== undefined ||
    input.accessCutOn !== undefined ||
    input.accessEvidence !== undefined;
  if (!isRenewal && hasAccessFields) fail('COMPLETION_NOT_ALLOWED');

  const note = blankToNull(input.note);
  if (input.completion === 'ALREADY_GONE' && note === null) fail('NOTE_REQUIRED');
  // An account that was already gone has nothing to show: the note of the IT Admin who confirmed it is the evidence.
  const evidence =
    input.completion === 'ALREADY_GONE' && !input.evidence.trim() ? (note ?? '') : cleanEvidence(input.evidence);

  const floor = endFloor(context.startsOn);
  const base = {
    completion: input.completion,
    evidence,
    note,
    paidThroughOn: null,
    accessState: null,
    accessCutOn: null,
    accessEvidence: null,
  } as const;
  if (!isRenewal) return { ...base, endOn: later(context.today, floor) };

  if (input.paidThroughOn === undefined) fail('PAID_THROUGH_REQUIRED');
  if (input.accessState === undefined) fail('ACCESS_STATE_REQUIRED');
  const paidThroughOn = input.paidThroughOn;
  if (input.accessState === 'UNTIL_PAID_END') {
    if (input.accessCutOn !== undefined || input.accessEvidence !== undefined) fail('ACCESS_STATE_INVALID');

    return { ...base, paidThroughOn, accessState: 'UNTIL_PAID_END', endOn: later(paidThroughOn, floor) };
  }

  const accessEvidence = blankToNull(input.accessEvidence);
  if (input.accessCutOn === undefined || accessEvidence === null) fail('ACCESS_STATE_REQUIRED');
  const accessCutOn = input.accessCutOn;
  if (accessCutOn > context.today) fail('ACCESS_STATE_INVALID');

  return {
    ...base,
    paidThroughOn,
    accessState: 'CUT',
    accessCutOn,
    accessEvidence,
    endOn: later(earlier(paidThroughOn, accessCutOn), floor),
  };
}

/** What cutting the access of a terminating K1 seat early stores, and the new end of the seat when it is earlier than the one it has. */
export interface AccessCutPlan {
  accessCutOn: BusinessDate;
  accessEvidence: string;
  /** The new end, or null when the seat already ends at that day or sooner: the cut is recorded and the end stays. */
  endOn: BusinessDate | null;
}

/**
 * The cut of an access that was left to run to the end of the paid period (`US-07-05` AC-19): it was cut on a day that is not
 * ahead, with the evidence, and shortens the seat only when it ends sooner than the seat does. Throws
 * RevocationCompletionError and ProvisioningEvidenceRequiredError.
 */
export function planAccessCut(
  input: { accessCutOn: BusinessDate; evidence: string },
  context: { today: BusinessDate; startsOn: BusinessDate; validUntil: BusinessDate },
): AccessCutPlan {
  if (input.accessCutOn > context.today) fail('ACCESS_STATE_INVALID');
  const accessEvidence = cleanEvidence(input.evidence);
  const endOn = later(input.accessCutOn, endFloor(context.startsOn));

  return { accessCutOn: input.accessCutOn, accessEvidence, endOn: endOn < context.validUntil ? endOn : null };
}

/**
 * True while a K1 seat is ending and its access runs on: the renewal is cancelled, the access is left to the end of the paid
 * period, and that day is still ahead (`US-07-05` AC-19). Read, never stored: when the day comes the seat is no longer held.
 */
export function isTerminating(
  task: { kind: ProvisioningTaskKind; status: ProvisioningTaskStatus; accessState: AccessState | null },
  validUntil: BusinessDate | null,
  today: BusinessDate,
): boolean {
  return (
    task.kind === 'REVOKE' &&
    task.status === 'COMPLETED' &&
    task.accessState === 'UNTIL_PAID_END' &&
    validUntil !== null &&
    validUntil > today
  );
}
