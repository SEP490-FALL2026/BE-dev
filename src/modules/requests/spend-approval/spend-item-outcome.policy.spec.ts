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
  const fromBatch = { context: 'BATCH' } as const;
  const fromTicket = { context: 'TICKET' } as const;

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

  it.each([
    [
      new TransientDatabaseError('40P01', new Error('deadlock')),
      { kind: 'RESULT', outcome: 'RETRYABLE', reason: 'TRANSIENT_FAILURE' },
    ],
    [new AccessRequestNotFoundError(), { kind: 'RESULT', outcome: 'SKIPPED', reason: 'NOT_IN_TICKET' }],
    [new AccessRequestGroupUsesLinesError(), { kind: 'GROUP_USES_LINES' }],
    [new SpendDecisionRefusedError('NO_SPEND_STEP'), { kind: 'NO_OPEN_STEP' }],
    [new SpendDecisionRefusedError('STEP_NOT_PENDING'), { kind: 'STEP_NOT_PENDING' }],
    [
      new SpendDecisionRefusedError('NOT_THE_ASSIGNEE'),
      { kind: 'RESULT', outcome: 'SKIPPED', reason: 'NOT_THE_ASSIGNEE' },
    ],
    [new SpendDecisionRefusedError('OWN_REQUEST'), { kind: 'RESULT', outcome: 'SKIPPED', reason: 'OWN_REQUEST' }],
    [new SpendDecisionRefusedError('NOT_CHECKABLE'), { kind: 'RESULT', outcome: 'SKIPPED', reason: 'NOT_CHECKABLE' }],
    [
      new BudgetCommitmentNotHoldableError('NO_APPROVED_BUDGET', 2026),
      { kind: 'RESULT', outcome: 'SKIPPED', reason: 'COMMITMENT_NOT_HOLDABLE' },
    ],
    [new BudgetCommitmentExistsError(2026), { kind: 'RESULT', outcome: 'SKIPPED', reason: 'COMMITMENT_NOT_HOLDABLE' }],
    [new AccessRequestNotPriceableError(), null],
    [new Error('unknown'), null],
  ])('classifies ticket error %s', (error, expected) => {
    expect(spendItemOutcome({ ...fromTicket, error })).toEqual(expected);
  });

  it('distinguishes a ticket spend decision that bounced to the head', () => {
    expect(spendItemOutcome({ ...fromTicket, result: { status: 'BOUNCED', to: 'HEAD', reasons: [] } })).toEqual({
      kind: 'BOUNCED_TO_HEAD',
    });
  });

  it.each(['HEAD', 'REQUESTER'] as const)('keeps the batch bounce reason for %s', (to) => {
    expect(spendItemOutcome({ ...fromBatch, result: { status: 'BOUNCED', to, reasons: [] } })).toEqual({
      kind: 'RESULT',
      outcome: 'SKIPPED',
      reason: 'RECHECKED_RETURNED_TO_HEAD',
    });
  });

  it('uses the ticket reason for a one-step bounce to the requester', () => {
    expect(spendItemOutcome({ ...fromTicket, result: { status: 'BOUNCED', to: 'REQUESTER', reasons: [] } })).toEqual({
      kind: 'RESULT',
      outcome: 'SKIPPED',
      reason: 'RECHECKED_RETURNED_TO_REQUESTER',
    });
  });

  it.each(['APPROVED', 'REJECTED', 'RETURNED'] as const)('preserves the recorded result %s', (recorded) => {
    expect(
      spendItemOutcome({
        ...fromBatch,
        result: { status: 'DECIDED', decision: recorded, requestState: 'state' },
      }),
    ).toEqual({ kind: 'RESULT', outcome: recorded, reason: null });
  });
});
