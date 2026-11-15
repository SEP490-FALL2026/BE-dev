import { randomUUID } from 'node:crypto';
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
  const seat = async (
    subscriptionId: string,
    planId: string,
    employeeId: string,
    over: { validFrom?: string; validUntil?: string | null; requestId?: string } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_until, valid_from_basis, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, $7, $8, 'ACTUAL', $9)`,
      [
        id,
        h.seed.organizationId,
        planId,
        subscriptionId,
        employeeId,
        `${id.slice(0, 8)}@acme.vn`,
        over.validFrom ?? `${h.year}-03-01`,
        over.validUntil ?? null,
        randomUUID(),
      ],
    );
    if (over.requestId) {
      await h.ctx.sql.query(
        `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, status, request_id, max_attempts,
           created_by_app_user_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'GRANT', 'MANUAL', 'QUEUED', $3, 4, $4, now())`,
        [h.seed.organizationId, id, over.requestId, randomUUID()],
      );
    }

    return id;
  };
  const rowsOf = async (subscriptionId: string): Promise<ChargeRow[]> =>
    (
      await h.ctx.sql.query<ChargeRow>(
        `SELECT department_id, cost_center_id, days, amount_minor::text, applied_minor::text, commitment_id
           FROM seat_month_charges WHERE subscription_id = $1 AND month = $2 ORDER BY department_id`,
        [subscriptionId, month()],
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
});
