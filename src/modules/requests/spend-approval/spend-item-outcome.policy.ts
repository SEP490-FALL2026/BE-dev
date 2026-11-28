import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { BudgetCommitmentExistsError, BudgetCommitmentNotHoldableError } from '../../budgets/public/budgets.errors';
import { AccessRequestGroupUsesLinesError, AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { SpendDecisionRefusedError } from '../spend/spend.errors';
import type { SpendDecisionResult } from './spend-decision-recorder.service';

export type SpendItemOutcome =
  | {
      kind: 'RESULT';
      outcome: 'APPROVED' | 'REJECTED' | 'RETURNED' | 'SKIPPED' | 'RETRYABLE';
      reason: string | null;
    }
  | { kind: 'NO_OPEN_STEP' }
  | { kind: 'GROUP_USES_LINES' };

const skipped = (reason: string): SpendItemOutcome => ({ kind: 'RESULT', outcome: 'SKIPPED', reason });

/** Classifies the result of one spend decision. Callers resolve a closed step, handle a group or propagate an unknown error. */
export function spendItemOutcome(input: {
  context: 'BATCH' | 'TICKET';
  decision: 'APPROVE' | 'REJECT' | 'RETURN';
  result?: SpendDecisionResult;
  error?: unknown;
}): SpendItemOutcome | null {
  const { context, error, result } = input;
  if (!result) return outcomeOfError(error);
  if (result.status === 'DECIDED') return { kind: 'RESULT', outcome: result.decision, reason: null };
  if (context === 'BATCH') return skipped('RECHECKED_RETURNED_TO_HEAD');

  return result.to === 'REQUESTER' ? skipped('RECHECKED_RETURNED_TO_REQUESTER') : null;
}

function outcomeOfError(error: unknown): SpendItemOutcome | null {
  if (error instanceof TransientDatabaseError) {
    return { kind: 'RESULT', outcome: 'RETRYABLE', reason: 'TRANSIENT_FAILURE' };
  }
  if (error instanceof AccessRequestNotFoundError) return skipped('NO_SPEND_STEP');
  if (error instanceof AccessRequestGroupUsesLinesError) return { kind: 'GROUP_USES_LINES' };
  if (error instanceof SpendDecisionRefusedError) {
    return error.reason === 'NO_SPEND_STEP' ? { kind: 'NO_OPEN_STEP' } : skipped(error.reason);
  }
  if (error instanceof BudgetCommitmentNotHoldableError || error instanceof BudgetCommitmentExistsError) {
    return skipped('COMMITMENT_NOT_HOLDABLE');
  }

  return null;
}
