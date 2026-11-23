import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { BudgetCommitmentExistsError, BudgetCommitmentNotHoldableError } from '../../budgets/public/budgets.errors';
import { AccessRequestGroupUsesLinesError, AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { SpendBatchDecisionService } from './spend-batch-decision.service';

const ACTOR = { employeeId: 'actor' } as never;
const BATCH_ID = 'batch-1';
const FIRST = '00000000-0000-4000-8000-000000000001';
const SECOND = '00000000-0000-4000-8000-000000000002';
const THIRD = '00000000-0000-4000-8000-000000000003';

function build(
  decide: jest.Mock,
  options: {
    returnWhole?: jest.Mock;
    recorded?: 'APPROVED' | 'REJECTED' | 'RETURNED' | null;
    batchOf?: string[];
  } = {},
) {
  const batches = {
    heldBy: jest.fn().mockResolvedValue(options.batchOf ?? [FIRST, SECOND]),
    findById: jest.fn().mockResolvedValue({ organizationId: 'org' }),
    requestIdsOf: jest.fn().mockResolvedValue(options.batchOf ?? [FIRST, SECOND]),
  };
  const runner = { run: jest.fn((fn: (tx: unknown) => unknown) => fn({})) };
  const checklists = { judge: jest.fn().mockResolvedValue({ verdict: 'OK', reason: null }) };

  return new SpendBatchDecisionService(
    batches as never,
    { decide } as never,
    runner as never,
    checklists as never,
    { returnWhole: options.returnWhole ?? jest.fn() } as never,
    { decisionOfLatestStep: jest.fn().mockResolvedValue(options.recorded ?? null) } as never,
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

describe('W1-16: a transient database failure of one request is retried on its own, and a request already decided by the caller says so', () => {
  const approve = { decision: 'APPROVE', requestIds: [FIRST, SECOND, THIRD] } as never;

  it('answers RETRYABLE for the request whose transaction failed transiently and decides the ones after it', async () => {
    const decide = jest
      .fn()
      .mockResolvedValueOnce({ status: 'DECIDED', decision: 'APPROVED' })
      .mockRejectedValueOnce(new TransientDatabaseError('40P01', new Error('deadlock detected')))
      .mockResolvedValueOnce({ status: 'DECIDED', decision: 'APPROVED' });

    const results = await build(decide, { batchOf: [FIRST, SECOND, THIRD] }).decide(ACTOR, BATCH_ID, approve);

    expect(results).toEqual([
      { requestId: FIRST, outcome: 'APPROVED', reason: null },
      { requestId: SECOND, outcome: 'RETRYABLE', reason: 'TRANSIENT_FAILURE' },
      { requestId: THIRD, outcome: 'APPROVED', reason: null },
    ]);
  });

  it('answers RETRYABLE when the return of a whole group fails transiently', async () => {
    const decide = jest.fn().mockRejectedValue(new AccessRequestGroupUsesLinesError());
    const returnWhole = jest.fn().mockRejectedValue(new TransientDatabaseError('40001', new Error('serialization')));

    const results = await build(decide, { returnWhole }).decide(ACTOR, BATCH_ID, {
      decision: 'RETURN',
      reason: 'Missing quote',
    } as never);

    expect(results).toEqual([
      { requestId: FIRST, outcome: 'RETRYABLE', reason: 'TRANSIENT_FAILURE' },
      { requestId: SECOND, outcome: 'RETRYABLE', reason: 'TRANSIENT_FAILURE' },
    ]);
  });

  it('still throws an error that is not transient', async () => {
    const decide = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(build(decide).decide(ACTOR, BATCH_ID, approve)).rejects.toThrow('boom');
  });

  it('gives back what the caller already decided on the latest spend step, with ALREADY_DECIDED, when the batch is sent again', async () => {
    const decide = jest.fn().mockRejectedValue(new AccessRequestNotFoundError());

    const results = await build(decide, { recorded: 'APPROVED' }).decide(ACTOR, BATCH_ID, {
      decision: 'APPROVE',
      requestIds: [FIRST],
    } as never);

    expect(results).toEqual([{ requestId: FIRST, outcome: 'APPROVED', reason: 'ALREADY_DECIDED' }]);
  });

  it('keeps SKIPPED NO_SPEND_STEP when the caller decided otherwise on that step, or nothing', async () => {
    const decide = jest.fn().mockRejectedValue(new AccessRequestNotFoundError());
    const body = { decision: 'APPROVE', requestIds: [FIRST] } as never;

    expect(await build(decide, { recorded: 'REJECTED' }).decide(ACTOR, BATCH_ID, body)).toEqual([
      { requestId: FIRST, outcome: 'SKIPPED', reason: 'NO_SPEND_STEP' },
    ]);
    expect(await build(decide, { recorded: null }).decide(ACTOR, BATCH_ID, body)).toEqual([
      { requestId: FIRST, outcome: 'SKIPPED', reason: 'NO_SPEND_STEP' },
    ]);
  });
});
