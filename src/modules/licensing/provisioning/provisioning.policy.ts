import { isCompanyAccount } from '../public/account-identifier.policy';
import {
  ProvisioningAccountIdentifierRequiredError,
  ProvisioningAnotherItAdminNeededError,
  ProvisioningEvidenceRequiredError,
  ProvisioningPersonalAccountError,
  ProvisioningReasonRequiredError,
  ProvisioningSubscriptionError,
  ProvisioningTaskNotManualError,
  ProvisioningTaskStateError,
  ProvisioningTypeNotSupportedError,
} from '../public/licensing.errors';
import { ProvisioningItAdminRequiredError, ProvisioningKeyError } from './provisioning.errors';
import type {
  ProvisioningAction,
  ProvisioningChannel,
  ProvisioningKind,
  ProvisioningTaskKind,
  ProvisioningTaskStatus,
  TaskDoneWhen,
  TaskStep,
} from '../public/licensing.types';

/** Only an IT Admin works the provisioning queue (`QĐ-87a`, `SoD-1`): the route guard is not the only place this is judged. */
export function assertItAdmin(actor: { roles: readonly string[] }): void {
  if (!actor.roles.includes('IT_ADMIN')) throw new ProvisioningItAdminRequiredError();
}

/** The longest note of evidence and reason a task keeps; the DTO bounds the request with them. */
export const EVIDENCE_MAX_LENGTH = 2000;
export const FAILURE_REASON_MAX_LENGTH = 1000;

const CONFIRM: TaskStep = { code: 'CONFIRM_WITH_EVIDENCE' };

/**
 * The steps of the card of a manual task, by the kind of provisioning of the plan (`US-07-02` AC-4, `US-07-01` AC-7,
 * AC-8). K3 is only specified and has no card. A K2 step names no identity but "whoever does the work": the account that
 * administers the workspace is that IT Admin's own, never shared (`QĐ-77d`).
 */
export function stepsFor(
  type: ProvisioningKind,
  accountIdentifier: string,
  taskKind: ProvisioningTaskKind = 'GRANT',
): TaskStep[] {
  if (taskKind === 'REVOKE') return revocationStepsFor(type);
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

/**
 * The steps of the card of a revocation (`US-07-05`): K1 cancels the renewal at the provider and records what is known of the
 * access, K2 removes the member under the name of the IT Admin who works (`QĐ-77d`), K4 deactivates the key on the device it was used
 * on (the key goes back to the store, `QĐ-103d`), K5 revokes in the internal software. K3 is specified only: it has no card.
 */
function revocationStepsFor(type: ProvisioningKind): TaskStep[] {
  switch (type) {
    case 'K1':
      return [{ code: 'CANCEL_RENEWAL_ON_PROVIDER' }, { code: 'RECORD_ACCESS_STATE' }, CONFIRM];
    case 'K2':
      return [{ code: 'REMOVE_FROM_WORKSPACE', adminIdentity: 'ACTING_IT_ADMIN' }, CONFIRM];
    case 'K4':
      return [{ code: 'DEACTIVATE_KEY_ON_DEVICE' }, CONFIRM];
    case 'K5':
      return [{ code: 'REVOKE_IN_INTERNAL_SOFTWARE' }, CONFIRM];
    default:
      return [];
  }
}

/** When the work is done for each kind: a lingering invitation of K2 is not done; a revocation by what it leaves behind. */
export function doneWhenFor(type: ProvisioningKind, taskKind: ProvisioningTaskKind = 'GRANT'): TaskDoneWhen {
  if (taskKind === 'REVOKE') {
    switch (type) {
      case 'K1':
        return 'RENEWAL_CANCELLED_WITH_ACCESS_STATE';
      case 'K2':
        return 'ACCOUNT_REMOVED_OR_NOT_NEEDED';
      case 'K5':
        return 'REVOKED_OFF_SYSTEM_WITH_EVIDENCE';
      default:
        return 'CONFIRMED_WITH_EVIDENCE';
    }
  }
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

/** K3 is specified only (`RB-4`): it is not granted. K4 is granted from the key pool of the plan (`QĐ-103d`). */
export function assertGrantableType(type: ProvisioningKind): void {
  if (type === 'K3') throw new ProvisioningTypeNotSupportedError(type);
}

/**
 * The key a completion names (`BR-MF1-09`, `QĐ-103d`): a K4 grant is completed by giving its seat a free key of the store, so it names
 * one; a grant of any other kind names none. Throws ProvisioningKeyError.
 */
export function assertKeyFits(type: ProvisioningKind, licenseKeyId: string | undefined): void {
  if (type === 'K4' && licenseKeyId === undefined) throw new ProvisioningKeyError('KEY_REQUIRED');
  if (type !== 'K4' && licenseKeyId !== undefined) throw new ProvisioningKeyError('KEY_NOT_APPLICABLE');
}

/**
 * K1 and K2 take a seat on a subscription: the one the IT Admin names, or, when none is named, the one the shared pool of the plan gives
 * (`P0-05`: the primary subscription of the plan, the one that has a free seat first). K5 holds no seat and takes none (`US-07-01` AC-11).
 */
export function assertSubscriptionChoice(type: ProvisioningKind, subscriptionId: string | undefined): void {
  if (type === 'K5' && subscriptionId !== undefined) throw new ProvisioningSubscriptionError('NOT_ALLOWED');
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

/**
 * The identifier a service account is granted to (`US-05-21` AC-4): the one the IT Admin enters, trimmed. It is not taken from
 * the request, whose identifier is only the sender's guess, and the rule of a company mail address does not apply: a
 * non-human subject has a login or a name, not a mailbox. Throws ProvisioningAccountIdentifierRequiredError.
 */
export function chooseServiceIdentifier(requested: string | undefined): string {
  const identifier = requested?.trim();
  if (!identifier) throw new ProvisioningAccountIdentifierRequiredError();

  return identifier;
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
