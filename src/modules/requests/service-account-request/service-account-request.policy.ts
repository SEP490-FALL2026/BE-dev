import type { ProvisioningKind } from '../../licensing/licensing.types';
import type {
  AccessRequestKind,
  AccessRequestState,
  ServiceAccountRecord,
} from '../access-request/access-request.types';

/**
 * The rules of a request for a service account (`US-05-21`): when it may be sent, and when and how the IT Admin gives the
 * verdict on its boundary (is it a non-human subject). Pure: the services read the facts and write what these decide.
 */

export type SubmitRefusal =
  /** A service account is asked for after the installation: the seat baseline of the first step has to be closed (`FR-9.4`). */
  | 'BASELINE_NOT_CLOSED'
  /** K3 cannot be granted yet and K4 is a key tied to a device, which no non-human subject holds. */
  | 'PLAN_NOT_SUPPORTED';

/** The kinds of provisioning a service account is granted by: a seat on a subscription (K1, K2) or in internal software (K5). */
const SERVICE_KINDS: readonly ProvisioningKind[] = ['K1', 'K2', 'K5'];

export function submitRefusal(input: {
  baselineClosed: boolean;
  provisioningType: ProvisioningKind;
}): SubmitRefusal | null {
  if (!input.baselineClosed) return 'BASELINE_NOT_CLOSED';

  return SERVICE_KINDS.includes(input.provisioningType) ? null : 'PLAN_NOT_SUPPORTED';
}

export type ReviewRefusal =
  /** Not a request for a service account, or not yet approved in full, so there is nothing to give a verdict on. */
  | 'NOT_REVIEWABLE'
  /** The verdict is given once. */
  | 'BOUNDARY_ALREADY_DECIDED'
  /** A refusal that gives no reason (the form already refuses it; this keeps the rule whoever calls). */
  | 'REASON_REQUIRED';

export function reviewRefusal(input: {
  type: AccessRequestKind;
  state: AccessRequestState;
  serviceAccount: Pick<ServiceAccountRecord, 'boundaryState'> | null;
}): ReviewRefusal | null {
  if (input.type !== 'SERVICE_ACCOUNT' || input.serviceAccount === null) return 'NOT_REVIEWABLE';
  if (input.serviceAccount.boundaryState !== 'PENDING') return 'BOUNDARY_ALREADY_DECIDED';

  // Every approval is taken once the request waits to be carried out: after the need step, or after the spend step.
  return input.state === 'AWAITING_EXECUTION' ? null : 'NOT_REVIEWABLE';
}

/** What the IT Admin decides about the boundary. */
export interface ReviewDecision {
  decision: 'ACCEPT' | 'REJECT';
  reason?: string;
}

export type BoundaryVerdict = { state: 'ACCEPTED'; reason: null } | { state: 'REJECTED'; reason: string };

/** The verdict a decision writes: an acceptance has no reason, a refusal keeps its own, trimmed; null for a refusal with none. */
export function verdictOf(input: ReviewDecision): BoundaryVerdict | null {
  if (input.decision === 'ACCEPT') return { state: 'ACCEPTED', reason: null };
  const reason = input.reason?.trim();

  return reason ? { state: 'REJECTED', reason } : null;
}
