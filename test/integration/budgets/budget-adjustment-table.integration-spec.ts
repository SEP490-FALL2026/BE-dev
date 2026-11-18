import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import {
  BudgetAdjustmentRepo,
  type NewAdjustment,
} from '../../../src/modules/budgets/adjustment/budget-adjustment.repo';
import { BudgetHarness } from '../../support/budget-harness';

const h = new BudgetHarness();

/**
 * The table of the adjustments of the budget in the year (`AD-1.1`; QĐ-111ag, C-1, R-48): the four kinds are what the check says they are, what Finance asks for is never
 * edited or removed, a decision is written once, and a version made by an adjustment (no proposal behind it) is one the database accepts.
 */
describe('the table of the adjustments keeps what was asked and is decided once (AD-1.1)', () => {
  let organizationId: string;
  let repo: BudgetAdjustmentRepo;
  let runner: TransactionRunner;
  let year = 2050;
  const finance = randomUUID();
  const approver = randomUUID();

  beforeAll(async () => {
    await h.start();
    organizationId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`)).rows[0].id;
    repo = h.ctx.app.get(BudgetAdjustmentRepo, { strict: false });
    runner = h.ctx.app.get(TransactionRunner, { strict: false });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const supplement = (over: Partial<NewAdjustment> = {}): NewAdjustment => ({
    organizationId,
    year: (year += 1),
    kind: 'SUPPLEMENT',
    fromCostCenterId: null,
    toCostCenterId: randomUUID(),
    amountMinor: 20_000_000n,
    currency: 'VND',
    reason: 'Dự án mới cần thêm ngân sách',
    transferReason: null,
    createdByEmployeeId: finance,
    createdAt: new Date('2050-02-01T02:00:00.000Z'),
    ...over,
  });
  const write = (input: NewAdjustment) => runner.run((tx) => repo.insert(tx, input));

  it('writes each of the four kinds and reads them back, pending', async () => {
    const [a, b, c, d] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const made = [
      await write(supplement({ toCostCenterId: a })),
      await write(
        supplement({ kind: 'TRANSFER', fromCostCenterId: a, toCostCenterId: b, transferReason: 'COST_CENTER_CHANGE' }),
      ),
      await write(supplement({ kind: 'RETURN', fromCostCenterId: c, toCostCenterId: null })),
      await write(supplement({ kind: 'CEILING_REDUCTION', fromCostCenterId: null, toCostCenterId: null })),
    ];

    expect(made.map((one) => one.kind)).toEqual(['SUPPLEMENT', 'TRANSFER', 'RETURN', 'CEILING_REDUCTION']);
    expect(made.every((one) => one.state === 'PENDING' && one.createdVersionId === null)).toBe(true);
    expect(await repo.findById(made[1].id)).toMatchObject({ transferReason: 'COST_CENTER_CHANGE', toCostCenterId: b });
    expect(d).toBeDefined();
  });

  it('refuses a kind that does not name the Cost Centers it should, an amount that is not above nothing, a blank reason and a reason that is not a transfer', async () => {
    const a = randomUUID();
    const bad: Partial<NewAdjustment>[] = [
      { fromCostCenterId: a },
      { toCostCenterId: null },
      { kind: 'TRANSFER', fromCostCenterId: a, toCostCenterId: a },
      { kind: 'TRANSFER', fromCostCenterId: null },
      { kind: 'RETURN', fromCostCenterId: a, toCostCenterId: a },
      { kind: 'CEILING_REDUCTION', fromCostCenterId: a, toCostCenterId: null },
      { amountMinor: 0n },
      { amountMinor: -5n },
      { reason: '   ' },
      { transferReason: 'COST_CENTER_CHANGE' },
    ];
    for (const over of bad) await expect(write(supplement(over))).rejects.toThrow(/check constraint/);
  });

  it('is decided once, with the reason of a rejection, and the version of an approval; a second decision is refused', async () => {
    const pending = await write(supplement());
    const rejected = await runner.run((tx) =>
      repo.decide(tx, pending.id, {
        state: 'REJECTED',
        decidedByEmployeeId: approver,
        decidedAt: new Date(),
        decisionReason: 'Không còn trong phần chưa phân bổ',
        createdVersionId: null,
      }),
    );

    expect(rejected).toBe(true);
    expect(await repo.findById(pending.id)).toMatchObject({ state: 'REJECTED', decidedByEmployeeId: approver });
    expect(
      await runner.run((tx) =>
        repo.decide(tx, pending.id, {
          state: 'APPROVED',
          decidedByEmployeeId: approver,
          decidedAt: new Date(),
          decisionReason: null,
          createdVersionId: null,
        }),
      ),
    ).toBe(false);
    await expect(
      h.ctx.sql.query(`UPDATE budget_adjustments SET state = 'APPROVED' WHERE id = $1`, [pending.id]),
    ).rejects.toThrow(/does not change again/);
  });

  /** A version of the first Cost Center, approved, made by an adjustment (R-48) or by a proposal: the database says which of them it accepts. */
  const insertVersion = async (origin: string) => {
    const costCenterId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM cost_centers LIMIT 1`)).rows[0].id;

    return h.ctx.sql.query<{ id: string }>(
      `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, origin, base_minor, reserve_minor, total_minor,
          currency, created_by_employee_id, sent_by_employee_id, sent_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 1, 'INITIAL', 'APPROVED', $4::"BudgetVersionOrigin", 20000000, 0, 20000000, 'VND', $5, $5, now())
       RETURNING id`,
      [organizationId, costCenterId, (year += 1), origin, finance],
    );
  };

  it('does not accept a rejection with no reason, and a version named by an adjustment that is not an approval', async () => {
    const pending = await write(supplement());
    const version = (await insertVersion('ADJUSTMENT')).rows[0].id;

    await expect(
      h.ctx.sql.query(
        `UPDATE budget_adjustments SET state = 'REJECTED', decided_by_employee_id = $2, decided_at = now() WHERE id = $1`,
        [pending.id, approver],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      h.ctx.sql.query(
        `UPDATE budget_adjustments SET state = 'REJECTED', decided_by_employee_id = $2, decided_at = now(), decision_reason = 'no',
                created_version_id = $3 WHERE id = $1`,
        [pending.id, approver, version],
      ),
    ).rejects.toThrow(/budget_adjustments_created_version_check/);
    expect(
      await runner.run((tx) =>
        repo.decide(tx, pending.id, {
          state: 'APPROVED',
          decidedByEmployeeId: approver,
          decidedAt: new Date(),
          decisionReason: null,
          createdVersionId: version,
        }),
      ),
    ).toBe(true);
    expect(await repo.findById(pending.id)).toMatchObject({ state: 'APPROVED', createdVersionId: version });
  });

  it('never changes what was asked, while it is pending or after, and is never removed or truncated', async () => {
    const pending = await write(supplement());
    for (const set of [
      'amount_minor = 1',
      `kind = 'RETURN'`,
      `reason = 'other'`,
      'year = 2000',
      `currency = 'USD'`,
      `to_cost_center_id = gen_random_uuid()`,
      `created_by_employee_id = gen_random_uuid()`,
      `created_at = now()`,
    ]) {
      await expect(h.ctx.sql.query(`UPDATE budget_adjustments SET ${set} WHERE id = $1`, [pending.id])).rejects.toThrow(
        /never changes|check constraint/,
      );
    }
    await expect(h.ctx.sql.query(`DELETE FROM budget_adjustments WHERE id = $1`, [pending.id])).rejects.toThrow(
      /keeps what was asked/,
    );
    await expect(h.ctx.sql.query(`TRUNCATE budget_adjustments`)).rejects.toThrow(/keeps what was asked/);
  });

  it('accepts a version of origin ADJUSTMENT with no proposal behind it, and still refuses one of origin PROPOSAL with none (R-48)', async () => {
    await expect(insertVersion('ADJUSTMENT')).resolves.toBeDefined();
    await expect(insertVersion('PROPOSAL')).rejects.toThrow(/budget_versions_source_check/);
  });
});
