import { isCompanyAccount } from '../../../core/account-identifier';
import {
  ProvisioningAnotherItAdminNeededError,
  ProvisioningEvidenceRequiredError,
  ProvisioningPersonalAccountError,
  ProvisioningReasonRequiredError,
  ProvisioningSubscriptionError,
  ProvisioningTaskNotManualError,
  ProvisioningTaskStateError,
  ProvisioningTypeNotSupportedError,
} from '../licensing.errors';
import type {
  ProvisioningAction,
  ProvisioningChannel,
  ProvisioningKind,
  ProvisioningTaskStatus,
  TaskDoneWhen,
  TaskStep,
} from '../licensing.types';

/** The longest note of evidence and reason a task keeps; the DTO bounds the request with them. */
export const EVIDENCE_MAX_LENGTH = 2000;
export const FAILURE_REASON_MAX_LENGTH = 1000;

const CONFIRM: TaskStep = { code: 'CONFIRM_WITH_EVIDENCE' };

/**
 * The steps of the card of a manual task, by the kind of provisioning of the plan (`US-07-02` AC-4, `US-07-01` AC-7,
 * AC-8). K3 is only specified and has no card. A K2 step names no identity but "whoever does the work": the account that
 * administers the workspace is that IT Admin's own, never shared (`QĐ-77d`).
 */
export function stepsFor(type: ProvisioningKind, accountIdentifier: string): TaskStep[] {
  switch (type) {
    case 'K1':
      return [{ code: 'BUY_ON_COMPANY_ACCOUNT', accountIdentifier }, CONFIRM];
    case 'K2':
      return [{ code: 'ADD_TO_WORKSPACE', accountIdentifier, adminIdentity: 'ACTING_IT_ADMIN' }, CONFIRM];
    case 'K4':
      return [{ code: 'OPEN_KEY_STORE' }, { code: 'ASSIGN_KEY_WITH_COMPANY_DEVICE' }, CONFIRM];
    case 'K5':
      return [{ code: 'GRANT_IN_INTERNAL_SOFTWARE', accountIdentifier }, CONFIRM];
    case 'K3':
      return [];
  }
}

/** When the work is done for each kind: a lingering invitation of K2 is not done. */
export function doneWhenFor(type: ProvisioningKind): TaskDoneWhen {
  switch (type) {
    case 'K1':
      return 'PURCHASE_CONFIRMED';
    case 'K2':
      return 'MEMBER_ACTIVE';
    case 'K4':
      return 'KEY_ASSIGNED_WITH_DEVICE';
    default:
      return 'CONFIRMED_WITH_EVIDENCE';
  }
}

/** K3 is specified only (`RB-4`) and K4 needs the key store and the company devices: neither is granted yet. */
export function assertGrantableType(type: ProvisioningKind): void {
  if (type === 'K3' || type === 'K4') throw new ProvisioningTypeNotSupportedError(type);
}

/** K1 and K2 take a seat on a subscription the IT Admin picks; K5 holds no seat and takes none (`US-07-01` AC-11). */
export function assertSubscriptionChoice(type: ProvisioningKind, subscriptionId: string | undefined): void {
  if (type === 'K5') {
    if (subscriptionId !== undefined) throw new ProvisioningSubscriptionError('NOT_ALLOWED');

    return;
  }
  if (subscriptionId === undefined) throw new ProvisioningSubscriptionError('REQUIRED');
}

/**
 * The account a paid right is granted to (`FR-2.9`, `US-07-01` AC-9): the work email, or another address the IT Admin
 * names, and always an address of a company domain, never a free mail provider's. Throws ProvisioningPersonalAccountError.
 */
export function chooseAccount(input: {
  workEmail: string | null;
  requested: string | undefined;
  companyDomains: readonly string[];
}): string {
  const candidate = (input.requested ?? input.workEmail)?.trim();
  if (!candidate || !isCompanyAccount(candidate, input.companyDomains)) throw new ProvisioningPersonalAccountError();

  return candidate;
}

/** The note of what was done, trimmed. Throws ProvisioningEvidenceRequiredError when there is none (`US-07-02` AC-5). */
export function cleanEvidence(raw: string): string {
  const evidence = raw.trim();
  if (evidence.length === 0) throw new ProvisioningEvidenceRequiredError();

  return evidence;
}

/** The reason a task could not be done, trimmed. Throws ProvisioningReasonRequiredError when there is none. */
export function cleanFailureReason(raw: string): string {
  const reason = raw.trim();
  if (reason.length === 0) throw new ProvisioningReasonRequiredError();

  return reason;
}

/**
 * The status a person's action leads to. Only the manual channel is worked by hand; a task is taken while it is queued
 * or already in progress (another IT Admin may take it over), and completed or failed only while in progress. Nothing here
 * moves with time: a task in progress for ten days is still in progress (`US-07-02` AC-2). Throws
 * ProvisioningTaskNotManualError and ProvisioningTaskStateError.
 */
export function nextStatus(
  status: ProvisioningTaskStatus,
  action: ProvisioningAction,
  channel: ProvisioningChannel,
): ProvisioningTaskStatus {
  if (channel !== 'MANUAL') throw new ProvisioningTaskNotManualError();
  if (action === 'CLAIM') {
    if (status === 'QUEUED' || status === 'IN_PROGRESS') return 'IN_PROGRESS';
    throw new ProvisioningTaskStateError('NOT_CLAIMABLE');
  }
  if (status !== 'IN_PROGRESS') throw new ProvisioningTaskStateError('NOT_IN_PROGRESS');

  return action === 'COMPLETE' ? 'COMPLETED' : 'FAILED';
}

/** True when the task is in the queue every IT Admin works: nobody is in charge, or the one in charge no longer works. */
export function inGeneralQueue(input: {
  defaultResponsibleEmployeeId: string | null;
  responsibleStillWorks: boolean;
}): boolean {
  return input.defaultResponsibleEmployeeId === null || !input.responsibleStillWorks;
}

/**
 * Whether the IT Admin may work a task of which they are the beneficiary (`QĐ-77m`, `US-01-05` AC-12): not while another
 * usable IT Admin can; when none can, they may, and the act is marked as self-executed. A task of someone else is never
 * restricted. Throws ProvisioningAnotherItAdminNeededError.
 */
export function selfExecution(input: {
  actorEmployeeId: string;
  beneficiaryEmployeeId: string;
  otherUsableItAdmins: number;
}): 'ALLOW' | 'ALLOW_SELF_EXECUTED' {
  if (input.actorEmployeeId !== input.beneficiaryEmployeeId) return 'ALLOW';
  if (input.otherUsableItAdmins > 0) throw new ProvisioningAnotherItAdminNeededError();

  return 'ALLOW_SELF_EXECUTED';
}
