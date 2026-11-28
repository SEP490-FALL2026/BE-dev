import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { BudgetCommitmentExistsError, BudgetCommitmentNotHoldableError } from '../../budgets/public/budgets.errors';
import {
  AccessRequestGroupUsesLinesError,
  AccessRequestNotFoundError,
  AccessRequestNotPriceableError,
} from '../access-request/access-request.errors';
import { SpendDecisionRefusedError } from '../spend/spend.errors';
import { spendItemOutcome } from './spend-item-outcome.policy';

describe('spendItemOutcome', () => {
  const fromBatch = { context: 'BATCH', decision: 'APPROVE' } as const;

  it.each([
    [
      new TransientDatabaseError('40P01', new Error('deadlock')),
      { kind: 'RESULT', outcome: 'RETRYABLE', reason: 'TRANSIENT_FAILURE' },
    ],
    [new AccessRequestNotFoundError(), { kind: 'RESULT', outcome: 'SKIPPED', reason: 'NO_SPEND_STEP' }],
    [new AccessRequestGroupUsesLinesError(), { kind: 'GROUP_USES_LINES' }],
    [new SpendDecisionRefusedError('NO_SPEND_STEP'), { kind: 'NO_OPEN_STEP' }],
    [
      new SpendDecisionRefusedError('NOT_THE_ASSIGNEE'),
      { kind: 'RESULT', outcome: 'SKIPPED', reason: 'NOT_THE_ASSIGNEE' },
    ],
    [
      new BudgetCommitmentNotHoldableError('NO_APPROVED_BUDGET', 2026),
      { kind: 'RESULT', outcome: 'SKIPPED', reason: 'COMMITMENT_NOT_HOLDABLE' },
    ],
    [new BudgetCommitmentExistsError(2026), { kind: 'RESULT', outcome: 'SKIPPED', reason: 'COMMITMENT_NOT_HOLDABLE' }],
    [new Error('unknown'), null],
    [new AccessRequestNotPriceableError(), null],
  ])('classifies error %s', (error, expected) => {
    expect(spendItemOutcome({ ...fromBatch, error })).toEqual(expected);
  });

  it.each(['HEAD', 'REQUESTER'] as const)('keeps the batch bounce reason for %s', (to) => {
    expect(spendItemOutcome({ ...fromBatch, result: { status: 'BOUNCED', to, reasons: [] } })).toEqual({
      kind: 'RESULT',
      outcome: 'SKIPPED',
      reason: 'RECHECKED_RETURNED_TO_HEAD',
    });
  });

  it('uses the ticket reason for a one-step bounce to the requester', () => {
    expect(
      spendItemOutcome({
        context: 'TICKET',
        decision: 'APPROVE',
        result: { status: 'BOUNCED', to: 'REQUESTER', reasons: [] },
      }),
    ).toEqual({ kind: 'RESULT', outcome: 'SKIPPED', reason: 'RECHECKED_RETURNED_TO_REQUESTER' });
  });

  it.each([
    ['APPROVE', 'APPROVED'],
    ['REJECT', 'REJECTED'],
    ['RETURN', 'RETURNED'],
  ] as const)('preserves the recorded result of %s', (decision, recorded) => {
    expect(
      spendItemOutcome({
        ...fromBatch,
        decision,
        result: { status: 'DECIDED', decision: recorded, requestState: 'state' },
      }),
    ).toEqual({ kind: 'RESULT', outcome: recorded, reason: null });
  });
});
