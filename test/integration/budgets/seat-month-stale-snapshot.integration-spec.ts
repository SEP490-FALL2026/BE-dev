import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { budgetYearLockKey } from '../../../src/modules/budgets/public/budget-year-lock-key.policy';
import { SeatMonthRepo } from '../../../src/modules/budgets/seat-month/seat-month.repo';
import { SeatMonthService } from '../../../src/modules/budgets/seat-month/seat-month.service';
import { InvoiceHarness } from '../../support/invoice-harness';
import { takeOwnerOff } from '../../support/shared-pool-subscription';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

/**
 * The seats a subscription is charged for are read inside the transaction of its charge, after the lock of its month, and the sweeper leaves a month alone that
 * was charged while it waited for that lock (`W1-05`); a Cost Center whose commitment still waits for a budget never has its budget year taken by a seat-month
 * (`W1-06`, `E1`). The barriers are deterministic: a spy holds the sweeper before its lock, and another connection holds the budget year.
 */
describe('seat-month reads under its lock and stays out of a waiting Cost Center year (integration; W1-05, W1-06)', () => {
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

  async function newPool(): Promise<string> {
    const pool = await takeOwnerOff(h, await h.subscription(10, 'K2'));
    await h.ctx.sql.query(
      `UPDATE subscriptions SET unit_price_minor = 400000, price_reporting_minor = 400000 WHERE id = $1`,
      [pool],
    );

    return pool;
  }
  const department = async (): Promise<Unit> => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-SS${counter}`);
    await h.budgetFor(unit, { total: 100 * M });

    return unit;
  };
  const holder = async (code: string, unit: Unit): Promise<string> => {
    const employeeId = await h.person(code);
    const open = `${h.year}-01-01`;
    await h.ctx.sql.query(
      `UPDATE employee_placements SET valid_from = '2020-01-01', valid_to = '${open}' WHERE employee_id = $1`,
      [employeeId],
    );
    await h.ctx.sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from, valid_to)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NULL)`,
      [h.seed.organizationId, employeeId, unit.department.id, open],
    );

    return employeeId;
  };
  /** An open seat that a Request made, begun the first of March; `requestId` names the Request whose grant task made it. */
  const seat = async (
    subscriptionId: string,
    planId: string,
    employeeId: string,
    requestId: string | null,
  ): Promise<string> => {
    const id = randomUUID();
    const validFrom = `${h.year}-03-01`;
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_until, valid_from_basis, created_by_app_user_id, granted_on)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST'::"AssignmentSource", $3, $4, $5, $6, $6, $7, NULL, 'ACTUAL', $8, $7)`,
      [
        id,
        h.seed.organizationId,
        planId,
        subscriptionId,
        employeeId,
        `${id.slice(0, 8)}@acme.vn`,
        validFrom,
        randomUUID(),
      ],
    );
    if (requestId) {
      await h.ctx.sql.query(
        `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, status, request_id, max_attempts,
           created_by_app_user_id, updated_at, claimed_by_app_user_id, claimed_at, completed_by_app_user_id, completed_at, evidence)
         VALUES (gen_random_uuid(), $1, $2, 'GRANT', 'MANUAL', 'COMPLETED', $3, 4, $4, now(), $4, now(), $4, now(), 'done')`,
        [h.seed.organizationId, id, requestId, randomUUID()],
      );
    }

    return id;
  };
  const rowsOf = async (subscriptionId: string) =>
    (
      await h.ctx.sql.query<{ id: string; days: number; amount_minor: string; commitment_id: string | null }>(
        `SELECT id, days, amount_minor::text, commitment_id FROM seat_month_charges WHERE subscription_id = $1 AND month = $2 ORDER BY department_id`,
        [subscriptionId, month()],
      )
    ).rows;

  it('W1-05: a sweeper pass held before its lock while a month on request charges the changed seats finds the mark afterwards and leaves the rows as they are', async () => {
    const pool = await newPool();
    const planId = await h.planOf(pool);
    const unit = await department();
    const seatId = await seat(pool, planId, await holder('E-SS-SNAP', unit), null);
    const repo = h.ctx.app.get(SeatMonthRepo, { strict: false });
    const lockMonthOf = repo.lockMonthOf.bind(repo);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let reached: () => void = () => undefined;
    const atTheLock = new Promise<void>((resolve) => (reached = resolve));
    let held = false;
    const spy = jest.spyOn(repo, 'lockMonthOf').mockImplementation(async (tx, subscriptionId, of) => {
      // The pass is held at the month the other charge writes, not at an earlier one of the same subscription.
      if (subscriptionId === pool && of === month() && !held) {
        held = true;
        reached();
        await gate;
      }

      return lockMonthOf(tx, subscriptionId, of);
    });
    try {
      const sweeper = service().chargeEndedMonths(`${h.year}-11-20`);
      await atTheLock;
      // The seat ends in the middle of the month after the sweeper started: what the sweeper would have read before its lock is no longer true.
      await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = '${h.year}-10-16' WHERE id = $1`, [seatId]);
      await service().chargeMonth(month());
      const chargedOnRequest = await rowsOf(pool);
      expect(chargedOnRequest).toHaveLength(1);
      expect(chargedOnRequest[0].days).toBeLessThan(31);

      release();
      await sweeper;

      // The same rows, with the same ids: the pass found the mark and wrote nothing, not even the same rows again.
      expect(await rowsOf(pool)).toEqual(chargedOnRequest);
    } finally {
      release();
      spy.mockRestore();
    }
  });

  it('W1-06: a seat-month of a Cost Center whose commitment waits for a budget does not wait for the budget year, which another transaction holds', async () => {
    const pool = await newPool();
    const planId = await h.planOf(pool);
    const unit = await department();
    const requestId = await h.fixtureRequestId();
    await seat(pool, planId, await holder('E-SS-WAIT', unit), requestId);
    // The commitment waits for a budget and is the one of the Request behind the seat, so the charge locks it and must not ask for the budget year.
    const commitmentId = await h.commitWaiting(unit, h.year, 10 * M, requestId);
    const other: Client = new Client({ connectionString: h.ctx.database.url });
    await other.connect();
    await other.query('BEGIN');
    await other.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      budgetYearLockKey(unit.department.unitId, h.year),
    ]);
    try {
      // With the year held elsewhere the charge would queue behind it and never finish: it finishes, and writes its rows.
      await expect(
        Promise.race([
          service().chargeMonth(month()),
          new Promise((_, reject) => setTimeout(() => reject(new Error('waited for the budget year')), 8000)),
        ]),
      ).resolves.toMatchObject({ failed: 0 });
      const rows = await rowsOf(pool);
      expect(rows).toHaveLength(1);
      expect(rows[0].commitment_id).toBe(commitmentId);
    } finally {
      await other.query('COMMIT');
      await other.end();
    }
  });
});
