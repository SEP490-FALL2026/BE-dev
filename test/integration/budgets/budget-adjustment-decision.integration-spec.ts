import { Client } from 'pg';
import { budgetYearLockKey } from '../../../src/modules/budgets/public/budget-year-lock-key.policy';
import { adjustmentCalls } from '../../support/adjustment-calls';
import { InvoiceHarness } from '../../support/invoice-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import { pretendBusinessToday } from '../../support/pretend-today';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;
const c = adjustmentCalls(h);

/**
 * What the approval of an adjustment does and what the day of the decision changes (`FIX-AD1` AD1-05; US-06-20 AC-2, AC-4, AC-5, AC-10, T-AD1): a transfer and a return move
 * the figures the way the story says (what the Cost Centers hold together does not change with a transfer, the annual ceiling does not change with a return), a transfer because
 * the department changed its Cost Center gives a Cost Center with no version the budget (R-48) and leaves the old one exactly what it used, the floor is looked at again at the
 * decision, a year that has ended is not adjusted any more, and the locks of the years are taken the lower id first.
 */
describe('an approved adjustment moves the budget the way the story says, and the day of the decision is the day that counts (integration; AD1-05)', () => {
  let admin: Unit;
  let sales: Unit;
  let old: Unit;
  let heir: Unit;
  let floor: Unit;
  let floorVersionId: string;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    admin = await h.departmentWithHead('P-AD5A');
    sales = await h.departmentWithHead('P-AD5S');
    old = await h.departmentWithHead('P-AD5O');
    heir = await h.departmentWithHead('P-AD5H');
    floor = await h.departmentWithHead('P-AD5F');
    await h.budgetFor(admin, { total: 180 * M, reserve: 18 * M, spent: 80 * M, held: 30 * M });
    await h.budgetFor(sales, { total: 100 * M });
    // AC-10: the effective budget of 338 tr, 190 tr used (100 tr spent, 90 tr held).
    await h.budgetFor(old, { total: 308 * M, reserve: 30 * M, spent: 100 * M, held: 90 * M });
    floorVersionId = (await h.budgetFor(floor, { total: 180 * M, reserve: 18 * M, spent: 80 * M, held: 30 * M })).id;
    await h.lockedCycle();
  }, 300000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  });

  it('AC-2: an approved transfer takes 30 tr from one Cost Center and gives it to the other, and what the Cost Centers hold together and what is not allocated do not change', async () => {
    await c.ceilingLeaving(29);
    const [adminBefore, salesBefore, heldBefore, ceilingBefore] = [
      await c.facts(admin),
      await c.facts(sales),
      await c.allocated(),
      await c.ceilingOf(),
    ];

    const asked = await c.made(c.transfer(admin, sales, 30));
    const approved = h.dataOf<{ state: string; createdVersionId: string | null }>(
      await c.decide(asked.id, { decision: 'APPROVE' }).expect(200),
    );

    expect(approved).toMatchObject({ state: 'APPROVED', createdVersionId: null });
    expect((await c.facts(admin))?.baseMinor).toBe((adminBefore?.baseMinor ?? 0n) - BigInt(30 * M));
    expect((await c.facts(sales))?.baseMinor).toBe((salesBefore?.baseMinor ?? 0n) + BigInt(30 * M));
    expect(await c.allocated()).toBe(heldBefore);
    expect(await c.ceilingOf()).toBe(ceilingBefore);
    expect((await c.facts(admin))?.reserveMinor).toBe(adminBefore?.reserveMinor);
    const told = await h.ctx.sql.query<{ recipient_employee_id: string }>(
      `SELECT recipient_employee_id FROM in_app_notifications WHERE code = 'BUDGET_ADJUSTMENT_DECIDED' AND params->>'adjustmentId' = $1`,
      [asked.id],
    );
    expect(told.rows.map((row) => row.recipient_employee_id)).toEqual(
      expect.arrayContaining([h.finance.employeeId, admin.head.account.employeeId, sales.head.account.employeeId]),
    );
  });

  it('AC-5: an approved return gives 20 tr back to what is not allocated: the Cost Center holds 20 tr less, the annual ceiling is as it was, 29 tr left become 49 tr', async () => {
    await c.ceilingLeaving(29);
    const [before, ceilingBefore] = [await c.facts(admin), await c.ceilingOf()];

    const asked = await c.made(c.giveBack(admin, 20));
    await c.decide(asked.id, { decision: 'APPROVE' }).expect(200);

    expect((await c.facts(admin))?.baseMinor).toBe((before?.baseMinor ?? 0n) - BigInt(20 * M));
    expect(await c.ceilingOf()).toBe(ceilingBefore);
    expect((await c.ceilingOf()) - (await c.allocated())).toBe(BigInt(49 * M));
  });

  it('AC-10, R-48: a transfer because the department changed its Cost Center gives the new one, which has no version, a budget of its own: 338 tr effective, 190 tr used, 148 tr moves, 149 tr does not, the old one keeps exactly what it used and the amount is counted once', async () => {
    expect(await c.facts(heir)).toBeUndefined();
    const heldBefore = await c.allocated();

    const over = await c.transfer(old, heir, 149, { transferReason: 'COST_CENTER_CHANGE' }).expect(422);
    expect(c.code(over)).toBe('BUDGET_ADJUSTMENT.OVER_REMAINING');
    const asked = await c.made(c.transfer(old, heir, 148, { transferReason: 'COST_CENTER_CHANGE' }));
    const approved = h.dataOf<{ createdVersionId: string | null }>(
      await c.decide(asked.id, { decision: 'APPROVE' }).expect(200),
    );

    expect(approved.createdVersionId).not.toBeNull();
    const version = await h.ctx.sql.query<{ origin: string; state: string; base_minor: string; reserve_minor: string }>(
      `SELECT origin::text, state::text, base_minor::text, reserve_minor::text FROM budget_versions WHERE id = $1`,
      [approved.createdVersionId],
    );
    expect(version.rows[0]).toEqual({
      origin: 'ADJUSTMENT',
      state: 'APPROVED',
      base_minor: String(148 * M),
      reserve_minor: '0',
    });
    expect(await c.facts(heir)).toMatchObject({
      baseMinor: BigInt(148 * M),
      versionBaseMinor: BigInt(148 * M),
      adjustmentMinor: 0n,
      reserveMinor: 0n,
    });
    const left = await c.facts(old);
    expect(left).toMatchObject({ baseMinor: BigInt(160 * M), reserveMinor: BigInt(30 * M) });
    expect((left?.baseMinor ?? 0n) + (left?.reserveMinor ?? 0n)).toBe(
      (left?.heldMinor ?? 0n) + (left?.spentMinor ?? 0n),
    );
    expect(await c.allocated()).toBe(heldBefore);
  });

  it('AC-4: the floor is looked at again at the decision: a transfer of 20 tr is asked while the forecast is 110 tr (178 tr stay), and refused when 70 tr more are held and the forecast is over 178 tr', async () => {
    const asked = await c.made(c.transfer(floor, sales, 20));
    await h.commit(floor, floorVersionId, h.year, 70 * M, 'HELD');

    const refused = await c.decide(asked.id, { decision: 'APPROVE' }).expect(422);

    expect(c.code(refused)).toBe('BUDGET_ADJUSTMENT.BELOW_FORECAST_FLOOR');
    expect(c.details(refused)).toMatchObject({ afterMinor: String(178 * M) });
    expect(Number(c.details(refused).floorMinor)).toBeGreaterThan(178 * M);
    expect(
      h.dataOf<{ state: string }>(
        await c.decide(asked.id, { decision: 'REJECT', reason: 'Dự kiến đã tăng' }).expect(200),
      ),
    ).toMatchObject({
      state: 'REJECTED',
    });
  });

  it('a year that has ended is not adjusted any more: asked or decided on 10 January of the year after, it is 422 BUDGET.YEAR_ENDED', async () => {
    await c.ceilingLeaving(10);
    const asked = await c.made(c.supplement(sales, 1));
    const day = pretendBusinessToday(h.ctx.app, `${h.year + 1}-01-10`);

    try {
      expect(c.code(await c.decide(asked.id, { decision: 'APPROVE' }).expect(422))).toBe('BUDGET.YEAR_ENDED');
      expect(c.code(await c.supplement(sales, 1).expect(422))).toBe('BUDGET.YEAR_ENDED');
    } finally {
      day.mockRestore();
    }
  });

  it('takes the lock of the year of each Cost Center the lower id first, whatever the direction of the transfer: while the decision waits for the higher one it already holds the lower one', async () => {
    await c.ceilingLeaving(10);
    const [low, high] = [admin, sales].sort((a, b) => (a.department.unitId < b.department.unitId ? -1 : 1));
    // From the higher id to the lower one: the order the adjustment names them in is the opposite of the order it must lock them in.
    const asked = await c.made(c.transfer(high, low, 1));
    const holder = new Client({ connectionString: h.ctx.database.url });
    const probe = new Client({ connectionString: h.ctx.database.url });
    await Promise.all([holder.connect(), probe.connect()]);
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        budgetYearLockKey(high.department.unitId, h.year),
      ]);
      const deciding = c.decide(asked.id, { decision: 'APPROVE' }).then((response) => response);
      await waitForLockWaiters(h.ctx.sql, 1);
      await probe.query('BEGIN');
      const free = await probe.query<{ free: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS free',
        [budgetYearLockKey(low.department.unitId, h.year)],
      );
      await probe.query('ROLLBACK');

      expect(free.rows[0].free).toBe(false);
      await holder.query('COMMIT');
      expect((await deciding).status).toBe(200);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await probe.query('ROLLBACK').catch(() => undefined);
      await Promise.all([holder.end(), probe.end()]);
    }
  });
});
