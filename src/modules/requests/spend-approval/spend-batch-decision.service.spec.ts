import { BudgetCommitmentExistsError, BudgetCommitmentNotHoldableError } from '../../budgets/public/budgets.errors';
import { SpendBatchDecisionService } from './spend-batch-decision.service';

const ACTOR = { employeeId: 'actor' } as never;
const BATCH_ID = 'batch-1';
const FIRST = '00000000-0000-4000-8000-000000000001';
const SECOND = '00000000-0000-4000-8000-000000000002';

function build(decide: jest.Mock) {
  const batches = {
    heldBy: jest.fn().mockResolvedValue([FIRST, SECOND]),
    findById: jest.fn().mockResolvedValue({ organizationId: 'org' }),
    requestIdsOf: jest.fn().mockResolvedValue([FIRST, SECOND]),
  };
  const runner = { run: jest.fn((fn: (tx: unknown) => unknown) => fn({})) };
  const checklists = { judge: jest.fn().mockResolvedValue({ verdict: 'OK', reason: null }) };

  return new SpendBatchDecisionService(
    batches as never,
    { decide } as never,
    runner as never,
    checklists as never,
    {} as never,
  );
}

describe('FX-T1: a commitment that cannot be held skips the request of a batch', () => {
  const body = { decision: 'APPROVE', requestIds: [FIRST, SECOND] } as never;

  it.each([
    ['BudgetCommitmentNotHoldableError', () => new BudgetCommitmentNotHoldableError('NO_APPROVED_BUDGET', 2026)],
    ['BudgetCommitmentExistsError', () => new BudgetCommitmentExistsError(2026)],
  ])('skips with COMMITMENT_NOT_HOLDABLE on %s and goes on with the next request', async (_name, make) => {
    const decide = jest
      .fn()
      .mockRejectedValueOnce(make())
      .mockResolvedValueOnce({ status: 'DECIDED', decision: 'APPROVED' });

    const results = await build(decide).decide(ACTOR, BATCH_ID, body);

    expect(results).toEqual([
      { requestId: FIRST, outcome: 'SKIPPED', reason: 'COMMITMENT_NOT_HOLDABLE' },
      { requestId: SECOND, outcome: 'APPROVED', reason: null },
    ]);
  });

  it('still throws an error nobody maps', async () => {
    const decide = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(build(decide).decide(ACTOR, BATCH_ID, body)).rejects.toThrow('boom');
  });
});
