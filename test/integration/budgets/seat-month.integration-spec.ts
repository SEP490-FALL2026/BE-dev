import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { SeatMonthRepo } from '../../../src/modules/budgets/seat-month/seat-month.repo';
import { SeatMonthService } from '../../../src/modules/budgets/seat-month/seat-month.service';
import { takeOwnerOff } from '../../support/shared-pool-subscription';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface ChargeRow {
  department_id: string;
  cost_center_id: string | null;
  days: number;
  amount_minor: string;
  applied_minor: string;
  commitment_id: string | null;
}

/**
 * The cost of a month of the seats of a K2 pool, charged to the department of the person on each day (`SM-1.4`, `T-SM1`, `QĐ-103k`). The month is
 * fixed in the year of the run, so the suite does not depend on the day it runs on.
 */
describe('a month of the seats of a K2 pool is charged to the departments of the holders by the day (integration; SM-1.4, T-SM1)', () => {
  let counter = 0;
  const month = () => `${h.year}-10-01`;
  const service = () => h.ctx.app.get(SeatMonthService, { strict: false });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A subscription of the shared pool of a K2 plan at 400.000 đ a seat a month. */
  async function newPool(): Promise<string> {
    const pool = await takeOwnerOff(h, await h.subscription(10, 'K2', h.seed.departmentId));
    await h.ctx.sql.query(
      `UPDATE subscriptions SET unit_price_minor = 400000, price_reporting_minor = 400000 WHERE id = $1`,
      [pool],
    );

    return pool;
  }
  const department = async (): Promise<Unit> => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-SM${counter}`);
    await h.budgetFor(unit, { total: 100 * M });

    return unit;
  };
  /** A person placed in the first department from the start of the year, and in the second from `movedOn` when it is given. */
  const holder = async (code: string, first: Unit, second?: Unit, movedOn?: string): Promise<string> => {
    const employeeId = await h.person(code);
    const open = `${h.year}-01-01`;
    const place = (departmentId: string, from: string, to: string | null) =>
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from, valid_to)
         VALUES (gen_random_uuid(), '${h.seed.organizationId}', '${employeeId}', '${departmentId}', '${from}', ${to ? `'${to}'` : 'NULL'});`;
    const statements = [
      `UPDATE employee_placements SET valid_from = '2020-01-01', valid_to = '${open}' WHERE employee_id = '${employeeId}';`,
      place(first.department.id, open, second && movedOn ? movedOn : null),
      ...(second && movedOn ? [place(second.department.id, movedOn, null)] : []),
    ];
    try {
      await h.ctx.sql.query(`BEGIN; ${statements.join(' ')} COMMIT;`);
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }

    return employeeId;
  };
  /**
   * A seat on the subscription. By default the one a Request made and whose grant was completed the day it begins (`granted_on`); `grantedOn: null` is one still
   * waiting for the IT Admin. A Request names the task of the grant, completed; a renewal carries the seat of `predecessorId` on.
   */
  const seat = async (
    subscriptionId: string,
    planId: string,
    employeeId: string,
    over: {
      validFrom?: string;
      validUntil?: string | null;
      requestId?: string;
      grantedOn?: string | null;
      source?: 'REQUEST' | 'BASELINE' | 'RENEWAL_CARRY';
      predecessorId?: string;
      failedAt?: string;
    } = {},
  ): Promise<string> => {
    const id = randomUUID();
    const validFrom = over.validFrom ?? `${h.year}-03-01`;
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_until, valid_from_basis, created_by_app_user_id,
         granted_on, predecessor_id, failed_at)
       VALUES ($1, $2, 'PERSONAL', $3::"AssignmentSource", $4, $5, $6, $7, $7, $8, $9, 'ACTUAL', $10, $11, $12, $13)`,
      [
        id,
        h.seed.organizationId,
        over.source ?? 'REQUEST',
        planId,
        subscriptionId,
        employeeId,
        `${id.slice(0, 8)}@acme.vn`,
        validFrom,
        over.validUntil ?? null,
        randomUUID(),
        over.grantedOn === undefined ? validFrom : over.grantedOn,
        over.predecessorId ?? null,
        over.failedAt ?? null,
      ],
    );
    if (over.requestId) {
      await h.ctx.sql.query(
        `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, status, request_id, max_attempts,
           created_by_app_user_id, updated_at, claimed_by_app_user_id, claimed_at, completed_by_app_user_id, completed_at, evidence)
         VALUES (gen_random_uuid(), $1, $2, 'GRANT', 'MANUAL', 'COMPLETED', $3, 4, $4, now(), $4, now(), $4, now(), 'done')`,
        [h.seed.organizationId, id, over.requestId, randomUUID()],
      );
    }

    return id;
  };
  const rowsOf = async (subscriptionId: string, of = month()): Promise<ChargeRow[]> =>
    (
      await h.ctx.sql.query<ChargeRow>(
        `SELECT department_id, cost_center_id, days, amount_minor::text, applied_minor::text, commitment_id
           FROM seat_month_charges WHERE subscription_id = $1 AND month = $2 ORDER BY department_id`,
        [subscriptionId, of],
      )
    ).rows;
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ applied_minor: string; state: string }>(
        `SELECT applied_minor::text, state::text FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];

  it('T-SM1: a seat of 400.000 đ moved on 26/10 is two rows, 25/31 = 322.581 đ for the old department and 6/31 = 77.419 đ for the new one, and charging again leaves the same rows', async () => {
    const pool = await newPool();
    const planId = await h.planOf(pool);
    const [from, to] = [await department(), await department()];
    const person = await holder('E-SM-T1', from, to, `${h.year}-10-26`);
    await seat(pool, planId, person);

    await service().chargeMonth(month());
    const first = await rowsOf(pool);
    await service().chargeMonth(month());

    expect(first).toHaveLength(2);
    const amounts = new Map(first.map((row) => [row.department_id, row]));
    expect(amounts.get(from.department.id)).toMatchObject({
      days: 25,
      amount_minor: '322581',
      cost_center_id: from.department.unitId,
    });
    expect(amounts.get(to.department.id)).toMatchObject({
      days: 6,
      amount_minor: '77419',
      cost_center_id: to.department.unitId,
    });
    expect(await rowsOf(pool)).toEqual(first);
  });

  it('takes the commitment of the seat down by the days of the department whose Cost Center is its own, never by the new department after the transfer; charging again applies nothing more', async () => {
    const pool = await newPool();
    const planId = await h.planOf(pool);
    const [from, to] = [await department(), await department()];
    const requestId = await h.waitingForApprover(from, planId, { amount: 400_000 });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const person = await holder('E-SM-T2', from, to, `${h.year}-10-26`);
    await seat(pool, planId, person, { requestId });

    await service().chargeMonth(month());
    await service().chargeMonth(month());

    const rows = new Map((await rowsOf(pool)).map((row) => [row.department_id, row]));
    expect(rows.get(from.department.id)).toMatchObject({ applied_minor: '322581' });
    expect(rows.get(from.department.id)?.commitment_id).not.toBeNull();
    expect(rows.get(to.department.id)).toMatchObject({ applied_minor: '0', commitment_id: null });
    expect(await commitmentOf(requestId)).toMatchObject({ applied_minor: '322581', state: 'HELD' });
  });

  it('charges nothing for a seat taken back before the month, and the days of a seat taken back in the month stop on the day', async () => {
    const pool = await newPool();
    const planId = await h.planOf(pool);
    const unit = await department();
    const gone = await holder('E-SM-GONE', unit);
    const leaving = await holder('E-SM-LEAVING', unit);
    await seat(pool, planId, gone, { validFrom: `${h.year}-01-05`, validUntil: `${h.year}-10-01` });
    await seat(pool, planId, leaving, { validFrom: `${h.year}-01-05`, validUntil: `${h.year}-10-16` });

    await service().chargeMonth(month());

    expect(await rowsOf(pool)).toMatchObject([{ department_id: unit.department.id, days: 15, amount_minor: '193548' }]);
  });

  it('SM1-01: a seat a renewal carried on still takes down the commitment of the Request that made the first seat, along a chain of three seats', async () => {
    const pool = await newPool();
    const planId = await h.planOf(pool);
    const unit = await department();
    const requestId = await h.waitingForApprover(unit, planId, { amount: 4_800_000 });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const person = await holder('E-SM-CARRY', unit);
    const first = await seat(pool, planId, person, {
      validFrom: `${h.year}-01-01`,
      validUntil: `${h.year}-04-01`,
      requestId,
    });
    const second = await seat(pool, planId, person, {
      validFrom: `${h.year}-04-01`,
      validUntil: `${h.year}-07-01`,
      source: 'RENEWAL_CARRY',
      predecessorId: first,
    });
    await seat(pool, planId, person, { validFrom: `${h.year}-07-01`, source: 'RENEWAL_CARRY', predecessorId: second });

    await service().chargeMonth(`${h.year}-07-01`);

    const [row] = await rowsOf(pool, `${h.year}-07-01`);
    expect(row.commitment_id).not.toBeNull();
    expect(row.applied_minor).toBe(row.amount_minor);
    expect(Number(row.applied_minor)).toBeGreaterThan(0);
    expect(await commitmentOf(requestId)).toMatchObject({ applied_minor: row.applied_minor });
  });

  const facts = async (unit: Unit) =>
    (await h.ctx.app.get(BudgetsApi, { strict: false }).yearFacts(unit.department.unitId, [h.year])).get(h.year);

  it('is the spend of the department that bore the days, beside its invoices, wherever the budget reads it (MG-03 = A)', async () => {
    const pool = await newPool();
    const planId = await h.planOf(pool);
    const [from, to] = [await department(), await department()];
    const person = await holder('E-SM-SPEND', from, to, `${h.year}-10-26`);
    await seat(pool, planId, person);

    await service().chargeMonth(month());

    expect(await facts(from)).toMatchObject({ spentMinor: 322_581n });
    expect(await facts(to)).toMatchObject({ spentMinor: 77_419n });
  });

  it('MG-03: the renewal of a pool of 10 seats with 6 held in department X, 2 in Y and 2 idle: X bears 6 seat-months, Y 2, the line of the pool 2, and the company spent the invoice', async () => {
    const pool = await newPool();
    const planId = await h.planOf(pool);
    const vendorId = (await h.vendorOf(planId)).id;
    const [x, y] = [await department(), await department()];
    for (let index = 0; index < 6; index += 1) await seat(pool, planId, await holder(`E-MG3-X${index}`, x));
    for (let index = 0; index < 2; index += 1) await seat(pool, planId, await holder(`E-MG3-Y${index}`, y));
    const invoice = await h.recordPurchase(vendorId, {
      subscriptionId: pool,
      serviceMonth: month(),
      netMinor: BigInt(10 * 400_000),
    });

    await service().chargeMonth(month());

    expect(invoice).toMatchObject({ booking: 'SUBSCRIPTION', actualCostMinor: 4_000_000n });
    expect(await facts(x)).toMatchObject({ spentMinor: 6n * 400_000n });
    expect(await facts(y)).toMatchObject({ spentMinor: 2n * 400_000n });
    const [line] = await h.ctx.app.get(SeatMonthRepo, { strict: false }).poolLinesOfMonth(month(), pool, 10);
    expect(line).toEqual({ subscriptionId: pool, invoicedMinor: 4_000_000n, allocatedMinor: 3_200_000n });
    // The company spent the invoice: the departments' share and the line of the pool add up to it, and the seat-months leave the invoice as it was.
    expect(6n * 400_000n + 2n * 400_000n + (line.invoicedMinor - line.allocatedMinor)).toBe(invoice.actualCostMinor);
    const summary = h.dataOf<{ companySpent: { amount: string }; sharedPoolUnallocated: { amount: string } }>(
      await h.summary(h.finance, { year: h.year }).expect(200),
    );
    // The invoice of the pool is in what the company spent, and what the seat-months left of the pools is the line of the pool (the year holds other pools too).
    const year = await h.ctx.app.get(SeatMonthRepo, { strict: false }).yearTotals(h.year);
    expect(year.companyMinor).toBeGreaterThanOrEqual(4_000_000n);
    expect(BigInt(summary.companySpent.amount)).toBe(year.companyMinor);
    expect(BigInt(summary.sharedPoolUnallocated.amount)).toBe(year.poolInvoicedMinor - year.allocatedMinor);
  });

  interface ListWire {
    items: Array<{ department: { id: string }; costCenter: { id: string } | null; amount: { amount: string } }>;
    pagination: { totalItems: number };
    poolLines: Array<{ subscriptionId: string; invoiced: { amount: string }; unallocated: { amount: string } }>;
  }
  const listing = (account: Parameters<typeof h.as>[0], query: Record<string, string | number> = {}) =>
    request(h.server())
      .get('/api/v1/seat-month-charges')
      .query({ year: h.year, month: 10, ...query })
      .set(h.as(account));

  it('answers Finance with every row of the month and the line of the pool, and a manager with the Cost Center of their own department only (D8)', async () => {
    const pool = await newPool();
    const planId = await h.planOf(pool);
    const vendorId = (await h.vendorOf(planId)).id;
    const [from, to] = [await department(), await department()];
    await seat(pool, planId, await holder('E-SM-LIST', from, to, `${h.year}-10-26`));
    await h.recordPurchase(vendorId, { subscriptionId: pool, serviceMonth: month(), netMinor: 400_000n });
    await service().chargeMonth(month());

    const finance = h.dataOf<ListWire>(await listing(h.finance, { subscriptionId: pool }).expect(200));
    const own = h.dataOf<ListWire>(await listing(from.head.account, { subscriptionId: pool }).expect(200));
    const other = h.dataOf<ListWire>(
      await listing(from.head.account, { subscriptionId: pool, costCenterId: to.department.unitId }).expect(200),
    );

    expect(finance.items.map((row) => row.amount.amount).sort()).toEqual(['322581', '77419']);
    expect(finance.poolLines).toMatchObject([
      { subscriptionId: pool, invoiced: { amount: '400000' }, unallocated: { amount: '0' } },
    ]);
    expect(own.items.map((row) => [row.costCenter?.id, row.amount.amount])).toEqual([
      [from.department.unitId, '322581'],
    ]);
    expect(own.poolLines).toEqual([]);
    expect(other.items).toEqual([]);
    await listing(h.it1).expect(403);
  });
});
