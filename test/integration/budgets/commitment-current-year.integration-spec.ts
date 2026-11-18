import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { CommitmentRepo } from '../../../src/modules/budgets/budget/commitment.repo';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface CommitmentRow {
  year: number;
  amount_minor: string;
  state: string;
  attached_version_id: string | null;
  unattached_reason: string | null;
  snapshot_check_id: string | null;
}

/**
 * A commitment is one, for the current fiscal year, on an approved version (`FR-5.8`(1), `FR-5.8a`, `INV-16`, `BR-MF1-07d`; item
 * `qd103-commitment-current-year`). The refusals are a safety net: the check of the budget already stops a request whose year has no approved
 * version, in the same transaction.
 */
describe('the one commitment of the current year over PostgreSQL (FR-5.8a, INV-16, BR-MF1-07d)', () => {
  let plan: string;
  let counter = 0;
  let snapshotCheckId: string;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    // One approved request gives a real check to hold on: the snapshot of a commitment points at a check.
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M });
    const id = await h.waitingForApprover(u, plan, { amount: 1 * M });
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    snapshotCheckId = (await held(id))[0].snapshot_check_id as string;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-Y${counter}`);
  };
  const held = async (requestId: string) =>
    (
      await h.ctx.sql.query<CommitmentRow>(
        `SELECT year, amount_minor::text, state, attached_version_id, unattached_reason, snapshot_check_id
           FROM budget_commitments WHERE request_id = $1 ORDER BY year`,
        [requestId],
      )
    ).rows;
  const hold = async (u: Unit, items: { year: number; amountMinor: bigint }[], requestId?: string) => {
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const budgets = h.ctx.app.get(BudgetsApi, { strict: false });
    const id = requestId ?? (await h.fixtureRequestId());
    const input = {
      organizationId: h.seed.organizationId,
      requestId: id,
      costCenterId: u.department.unitId,
      snapshotCheckId,
      currency: h.reporting,
      now: new Date(),
      items,
    };

    return {
      id,
      result: runner.run((tx) => budgets.holdForRequest(tx, h.principal(h.boss.account, ['SPENDING_APPROVER']), input)),
    };
  };

  it('BR-MF1-07d: holds one commitment for the current year, attached to the approved version, with the snapshot of the check', async () => {
    const u = await unit();
    const version = await h.budgetFor(u, { total: 100 * M });

    const { id, result } = await hold(u, [{ year: h.year, amountMinor: 14_000n }]);
    await result;

    expect(await held(id)).toEqual([
      expect.objectContaining({
        year: h.year,
        amount_minor: '14000',
        state: 'HELD',
        attached_version_id: version.id,
        unattached_reason: null,
        snapshot_check_id: snapshotCheckId,
      }),
    ]);
  });

  it.each([
    ['next year', () => h.next],
    ['last year', () => h.year - 1],
  ])('FR-5.8a: refuses a commitment for %s with NOT_CURRENT_YEAR and writes nothing', async (_name, year) => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M });
    await h.budgetFor(u, { total: 100 * M, year: h.next });

    const { id, result } = await hold(u, [{ year: year(), amountMinor: 1_000n }]);

    await expect(result).rejects.toMatchObject({
      name: 'BudgetCommitmentNotHoldableError',
      reason: 'NOT_CURRENT_YEAR',
    });
    expect(await held(id)).toEqual([]);
  });

  it('INV-16: refuses two years with MORE_THAN_ONE_YEAR, and writes nothing', async () => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M });

    const { id, result } = await hold(u, [
      { year: h.year, amountMinor: 1_000n },
      { year: h.next, amountMinor: 1_000n },
    ]);

    await expect(result).rejects.toMatchObject({
      name: 'BudgetCommitmentNotHoldableError',
      reason: 'MORE_THAN_ONE_YEAR',
    });
    expect(await held(id)).toEqual([]);
  });

  it.each([0n, -5n])('INV-16: refuses an amount of %s with NOT_POSITIVE, and writes nothing', async (amountMinor) => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M });

    const { id, result } = await hold(u, [{ year: h.year, amountMinor }]);

    await expect(result).rejects.toMatchObject({ name: 'BudgetCommitmentNotHoldableError', reason: 'NOT_POSITIVE' });
    expect(await held(id)).toEqual([]);
  });

  it('FR-5.8a: refuses a commitment when the Cost Center has no approved version of the year, and leaves no row', async () => {
    const u = await unit();

    const { id, result } = await hold(u, [{ year: h.year, amountMinor: 1_000n }]);

    await expect(result).rejects.toMatchObject({
      name: 'BudgetCommitmentNotHoldableError',
      reason: 'NO_APPROVED_BUDGET',
      year: h.year,
    });
    expect(await held(id)).toEqual([]);
  });

  it('INV-16: holds the year once: a second hold for the same request and year is refused and the first stays', async () => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M });
    const first = await hold(u, [{ year: h.year, amountMinor: 1_000n }]);
    await first.result;

    const second = await hold(u, [{ year: h.year, amountMinor: 2_000n }], first.id);

    await expect(second.result).rejects.toMatchObject({ name: 'BudgetCommitmentExistsError', year: h.year });
    expect(await held(first.id)).toEqual([expect.objectContaining({ amount_minor: '1000' })]);
  });

  it('FR-5.8a: only the commitment made on 01/01 (allowUnattached, at the level of the repo) may wait for a budget, with the reason NO_BUDGET', async () => {
    const u = await unit();
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const repo = h.ctx.app.get(CommitmentRepo, { strict: false });
    const id = await h.fixtureRequestId();
    const input = {
      organizationId: h.seed.organizationId,
      requestId: id,
      costCenterId: u.department.unitId,
      snapshotCheckId,
      currency: h.reporting,
      now: new Date(),
      items: [{ year: h.year, amountMinor: 3_000n }],
    };

    await expect(runner.run((tx) => repo.hold(tx, input))).rejects.toMatchObject({
      name: 'BudgetCommitmentNotHoldableError',
      reason: 'NO_APPROVED_BUDGET',
    });
    await runner.run((tx) => repo.hold(tx, input, { allowUnattached: true }));

    expect(await held(id)).toEqual([
      expect.objectContaining({ amount_minor: '3000', attached_version_id: null, unattached_reason: 'NO_BUDGET' }),
    ]);
  });

  it('Q-27: a commitment written before the rule, for a later year or waiting for a budget, is still released as before', async () => {
    const u = await unit();
    const version = await h.budgetFor(u, { total: 100 * M });
    await h.commit(u, version.id, h.next, 5_000, 'HELD');
    const old = await h.ctx.sql.query<{ id: string; request_id: string }>(
      `SELECT id, request_id FROM budget_commitments WHERE cost_center_id = $1 AND year = $2`,
      [u.department.unitId, h.next],
    );
    expect(old.rowCount).toBe(1);

    await expect(
      h.ctx.app
        .get(TransactionRunner, { strict: false })
        .run((tx) =>
          h.ctx.app
            .get(BudgetsApi, { strict: false })
            .releaseForRequest(tx, { requestId: old.rows[0].request_id, reason: 'REQUEST_WITHDRAWN', now: new Date() }),
        ),
    ).resolves.toBeDefined();
  });
});
