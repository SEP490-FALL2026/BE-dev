import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { BudgetCommitmentExistsError, BudgetCommitmentNotHoldableError } from '../../budgets/public/budgets.errors';
import { AccessRequestGroupUsesLinesError, AccessRequestNotFoundError } from '../access-request/access-request.errors';
import type { BatchDecisionResultWire } from '../spend-approval-view/spend-approval.dto';
import { SpendDecisionRefusedError } from '../spend/spend.errors';
import type { SpendDecisionResult } from './spend-decision-recorder.service';

export type BatchReason = BatchDecisionResultWire['reason'];
export type TicketSpendReason =
  | 'NOT_IN_TICKET'
  | 'USE_BATCH'
  | 'NO_SPEND_STEP'
  | 'NOT_THE_ASSIGNEE'
  | 'OWN_REQUEST'
  | 'NOT_CHECKABLE'
  | 'RECHECKED_RETURNED_TO_REQUESTER'
  | 'COMMITMENT_NOT_HOLDABLE'
  | 'ALREADY_DECIDED'
  | 'TRANSIENT_FAILURE'
  | null;

export type SpendItemOutcome<Reason extends BatchReason | TicketSpendReason> =
  | {
      kind: 'RESULT';
      outcome: 'APPROVED' | 'REJECTED' | 'RETURNED' | 'SKIPPED' | 'RETRYABLE';
      reason: Reason;
    }
  | { kind: 'NO_OPEN_STEP' }
  | { kind: 'GROUP_USES_LINES' };

type TicketSpendItemOutcome =
  SpendItemOutcome<TicketSpendReason> | { kind: 'STEP_NOT_PENDING' } | { kind: 'BOUNCED_TO_HEAD' };

interface SpendItemInput {
  result?: SpendDecisionResult;
  error?: unknown;
}

type SpendItemContext = 'BATCH' | 'TICKET';
type ContextualSpendItemOutcome = SpendItemOutcome<BatchReason> | TicketSpendItemOutcome;

const skipped = <Reason extends BatchReason | TicketSpendReason>(reason: Reason) =>
  ({ kind: 'RESULT', outcome: 'SKIPPED', reason }) as const;

/** Classifies the result of one spend decision. A null outcome leaves the error for the caller to propagate. */
export function spendItemOutcome(input: SpendItemInput & { context: 'BATCH' }): SpendItemOutcome<BatchReason> | null;
export function spendItemOutcome(input: SpendItemInput & { context: 'TICKET' }): TicketSpendItemOutcome | null;
export function spendItemOutcome(
  input: SpendItemInput & { context: SpendItemContext },
): ContextualSpendItemOutcome | null {
  const { context, error, result } = input;
  if (!result) return outcomeOfError(context, error);
  if (result.status === 'DECIDED') return { kind: 'RESULT', outcome: result.decision, reason: null };
  if (context === 'BATCH') return skipped('RECHECKED_RETURNED_TO_HEAD');
  if (result.to === 'HEAD') return { kind: 'BOUNCED_TO_HEAD' };
  return skipped('RECHECKED_RETURNED_TO_REQUESTER');
}

function outcomeOfError(context: SpendItemContext, error: unknown): ContextualSpendItemOutcome | null {
  if (error instanceof TransientDatabaseError) {
    return { kind: 'RESULT', outcome: 'RETRYABLE', reason: 'TRANSIENT_FAILURE' };
  }
  if (error instanceof AccessRequestNotFoundError) {
    return context === 'BATCH' ? skipped('NO_SPEND_STEP') : skipped('NOT_IN_TICKET');
  }
  if (error instanceof AccessRequestGroupUsesLinesError) return { kind: 'GROUP_USES_LINES' };
  if (error instanceof SpendDecisionRefusedError) {
    if (error.reason === 'NO_SPEND_STEP') return { kind: 'NO_OPEN_STEP' };
    if (context === 'TICKET' && error.reason === 'STEP_NOT_PENDING') return { kind: 'STEP_NOT_PENDING' };
    return skipped(error.reason);
  }
  if (error instanceof BudgetCommitmentNotHoldableError || error instanceof BudgetCommitmentExistsError) {
    return skipped('COMMITMENT_NOT_HOLDABLE');
  }

  return null;
}
