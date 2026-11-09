import { budgetYearLockKey } from '../../../src/modules/budgets/public/budget-year-lock-key.policy';
import { YearStartCommitmentsService } from '../../../src/modules/requests/year-start-commitments/year-start-commitments.service';
import { GroupHarness } from '../../support/group-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import { pretendBusinessToday } from '../../support/pretend-today';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;
/** The plans of the suite are priced 1 000 000 a month (`subscription` of the seat harness). */
const MONTH = 1_000_000n;

/** The columns of a request that has ended in each way, as the checks of the table want them. */
const ENDED: Record<string, string> = {
  WITHDRAWN: `state = 'WITHDRAWN', withdrawal_requested_at = now(), withdrawn_by_employee_id = requester_employee_id, withdrawn_at = now(), withdrawal_reason = 'No longer needed'`,
  CANCELLED: `state = 'CANCELLED', cancelled_at = now(), cancelled_by_employee_id = requester_employee_id, cancel_cause = 'BENEFICIARY_LEFT'`,
  FAILED: `state = 'FAILED'`,
};

interface CommitmentRow {
  year: number;
  amount_minor: string;
  origin: string;
  state: string;
  attached_version_id: string | null;
  unattached_reason: string | null;
  snapshot_check_id: string | null;
  seat_monthly_minor: string | null;
  cost_center_id: string;
}

/**
 * The commitments made on 01/01 (`FR-5.8`(6), `FR-5.8a`, `BR-MF1-09e`, `QĐ-109a`; item `qd103-new-year-auto-commitments`): every paid request whose
 * right goes on into the new year, or that was approved as spend and not yet granted, gets one commitment for the year from a pass of the system.
 * The day is the one the organization is on (`pretendBusinessToday`), so a suite runs the pass on 01/01 of next year without waiting for it.
 */
describe('the commitments of 01/01 over PostgreSQL (BR-MF1-09e, FR-5.8a, QĐ-109a)', () => {
  let k2Subscription: string;
  let k2: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    k2Subscription = await h.subscription(100);
    k2 = await h.planOf(k2Subscription);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  beforeEach(async () => {
    // What the migration does for the year of the deployment, and nothing for the year that begins: the pass of this suite is the first of it.
    await h.ctx.sql.query(
      `INSERT INTO year_start_commitment_runs (organization_id, year, started_at, completed_at)
       SELECT id, $1, now(), now() FROM organizations ON CONFLICT DO NOTHING`,
      [h.year],
    );
    await h.ctx.sql.query(`DELETE FROM year_start_commitment_runs WHERE year = $1`, [h.next]);
  });

  afterEach(() => jest.restoreAllMocks());

  const unit = async (budgetOfNextYear = true): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-NY${counter}`);
    if (budgetOfNextYear) await h.roomFor(made);
    else await h.budgetFor(made, { total: 100_000_000_000 });

    return made;
  };
  const service = () => h.ctx.app.get(YearStartCommitmentsService, { strict: false });
  /** The pass on 01/01 of the year that follows, with the day the organization is on pretended. */
  const passOn = (day = `${h.next}-01-01`) => {
    pretendBusinessToday(h.ctx.app, day);

    return service().run(new Date());
  };
  /** A request approved as spend this year, which waits for the IT Admin: it holds this year's commitment, as the approval made it. */
  const approved = async (u: Unit, plan = k2): Promise<string> => {
    const id = await h.waitingForApprover(u, plan, { amount: 1 * M });
    // The harness sends a request for one month: this one is for a right with no end, as a member's is.
    await h.ctx.sql.query(`UPDATE access_requests SET expected_end_date = NULL, term_months = NULL WHERE id = $1`, [
      id,
    ]);
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return id;
  };
  /** The grant of a seat of the request: made by the IT Admin, and carried out unless `complete` says it is still under way. */
  const granted = async (id: string, options: { employeeId?: string; complete?: boolean } = {}): Promise<string> => {
    const task = h.dataOf<{ task: { id: string } }>(
      await h
        .grantLine({ requestId: id, subscriptionId: k2Subscription, beneficiaryEmployeeId: options.employeeId }, h.it1)
        .expect(201),
    ).task;
    if (options.complete ?? true) {
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Invited by work email' }).expect(200);
    }

    return task.id;
  };
  const rows = async (requestId: string, year = h.next) =>
    (
      await h.ctx.sql.query<CommitmentRow>(
        `SELECT year, amount_minor::text, origin::text, state::text, attached_version_id, unattached_reason, snapshot_check_id,
                seat_monthly_minor::text, cost_center_id
           FROM budget_commitments WHERE request_id = $1 AND year = $2`,
        [requestId, year],
      )
    ).rows;
  const events = async (action: string, resourceId?: string) =>
    (
      await h.ctx.sql.query<{ actor_kind: string; after: Record<string, unknown> }>(
        `SELECT actor_kind::text, after FROM audit_events WHERE action = $1 AND ($2::text IS NULL OR resource_id::text = $2) ORDER BY occurred_at, id`,
        [action, resourceId ?? null],
      )
    ).rows;
  const runRow = async (year = h.next) =>
    (
      await h.ctx.sql.query<{ completed: boolean; run_count: number; created_count: number }>(
        `SELECT completed_at IS NOT NULL AS completed, run_count, created_count FROM year_start_commitment_runs WHERE year = $1`,
        [year],
      )
    ).rows[0];

  describe('who gets a commitment, and for how much', () => {
    it('BR-MF1-09e: a request approved this year and not yet granted gets one for the new year, twelve months at the price on 01/01, on the budget of the new year, with no check behind it', async () => {
      const u = await unit();
      const id = await approved(u);
      const version = (
        await h.ctx.sql.query<{ id: string }>(
          `SELECT id FROM budget_versions WHERE cost_center_id = $1 AND year = $2 AND state = 'APPROVED'`,
          [u.department.unitId, h.next],
        )
      ).rows[0].id;

      const result = await passOn();

      expect(result).toMatchObject({ status: 'COMPLETED', year: h.next });
      expect(await rows(id)).toEqual([
        {
          year: h.next,
          amount_minor: String(12n * MONTH),
          origin: 'YEAR_START',
          state: 'HELD',
          attached_version_id: version,
          unattached_reason: null,
          snapshot_check_id: null,
          seat_monthly_minor: String(MONTH),
          cost_center_id: u.department.unitId,
        },
      ]);
      // The commitment of this year, made by the approval, stays where it is: the year of the old stays with the old (BR-MF1-09e).
      expect(await rows(id, h.year)).toEqual([expect.objectContaining({ origin: 'APPROVAL', year: h.year })]);
    });

    it('BR-MF1-09e: a request that was granted and still runs on 01/01 gets one', async () => {
      const id = await approved(await unit());
      await granted(id);

      await passOn();

      expect((await rows(id)).map((row) => row.amount_minor)).toEqual([String(12n * MONTH)]);
    });

    it('BR-MF1-09e: a request for a group counts the people granted, the one being granted and the one not yet granted: three seats', async () => {
      const u = await unit();
      const people = await h.colleagues(u, 3);
      const group = await h.groupApproved(u, k2, people);
      await granted(group, { employeeId: people[0].employeeId });
      await granted(group, { employeeId: people[1].employeeId, complete: false });

      await passOn();

      expect((await rows(group)).map((row) => row.amount_minor)).toEqual([String(36n * MONTH)]);
    });

    it('BR-MF1-09e: a right that ends on 31/03 of the new year counts three months, the month of the end whole', async () => {
      const id = await approved(await unit());
      await h.ctx.sql.query(`UPDATE access_requests SET expected_end_date = $2 WHERE id = $1`, [id, `${h.next}-03-31`]);

      await passOn();

      expect((await rows(id)).map((row) => row.amount_minor)).toEqual([String(3n * MONTH)]);
    });

    it('BR-MF1-09e: a right that ended before 01/01 has no commitment for the year', async () => {
      const id = await approved(await unit());
      await granted(id);
      await h.ctx.sql.query(
        `UPDATE license_assignments SET valid_until = valid_from + 1
          WHERE id IN (SELECT assignment_id FROM provisioning_tasks WHERE request_id = $1)`,
        [id],
      );

      await passOn();

      expect(await rows(id)).toEqual([]);
    });

    it.each(Object.keys(ENDED))(
      'BR-MF1-09e: a request that is %s when the pass runs has no commitment (it is read in the state it has now)',
      async (state) => {
        const id = await approved(await unit());
        await h.ctx.sql.query(`UPDATE access_requests SET ${ENDED[state]} WHERE id = $1`, [id]);

        await passOn();

        expect(await rows(id)).toEqual([]);
      },
    );

    it('QĐ-109a: a request that already holds a commitment for the new year is left as it was', async () => {
      const u = await unit();
      const id = await approved(u);
      await h.ctx.sql.query(
        `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, unattached_reason)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 777, $5, 'HELD'::"CommitmentState", 'NO_BUDGET')`,
        [h.seed.organizationId, id, u.department.unitId, h.next, h.reporting],
      );

      await passOn();

      expect(await rows(id)).toEqual([expect.objectContaining({ amount_minor: '777', origin: 'APPROVAL' })]);
    });

    it('BR-MF1-09e: a plan without a price, and a department without a Cost Center in use, are left out, each with the reason in the Audit Trail', async () => {
      const u = await unit();
      const unpriced = await approved(u);
      await h.ctx.sql.query(`UPDATE access_requests SET plan_id = $2 WHERE id = $1`, [
        unpriced,
        await h.planOf(await h.draftSubscription()),
      ]);
      const bare = await h.bareDepartment();
      const homeless = await approved(await unit());
      await h.ctx.sql.query(`UPDATE access_requests SET department_id = $2 WHERE id = $1`, [homeless, bare.id]);

      await passOn();

      expect([await rows(unpriced), await rows(homeless)]).toEqual([[], []]);
      expect((await events('BUDGET_COMMITMENT.YEAR_START_SKIPPED', unpriced))[0]).toMatchObject({
        actor_kind: 'SYSTEM',
        after: { year: h.next, reason: 'NO_PRICE' },
      });
      expect((await events('BUDGET_COMMITMENT.YEAR_START_SKIPPED', homeless))[0].after).toMatchObject({
        reason: 'NO_COST_CENTER',
      });
    });
  });

  describe('what kind of software, and which day', () => {
    it('BR-MF1-09e: a K1 plan gets a commitment like a K2 plan; a key (K4) has none, whatever the subscription says', async () => {
      const u = await unit();
      const k1Subscription = await h.subscription(100, 'K1');
      const keySubscription = await h.subscription(100, 'K4');
      const k1Request = await approved(u, await h.planOf(k1Subscription));
      const keyRequest = await approved(u, await h.planOf(keySubscription));

      await passOn();

      expect((await rows(k1Request)).map((row) => row.amount_minor)).toEqual([String(12n * MONTH)]);
      expect(await rows(keyRequest)).toEqual([]);
    });

    it('BR-MF1-09e: a pass that runs late still counts the months of the year from 01/01 and the price of the main subscription', async () => {
      const id = await approved(await unit());

      await passOn(`${h.next}-02-05`);

      expect((await rows(id)).map((row) => row.amount_minor)).toEqual([String(12n * MONTH)]);
    });

    it('BR-MF1-09e: the day is the one of the time zone of the organization: it begins at its midnight, not at the one of UTC', async () => {
      const id = await approved(await unit());
      const zone = (await h.ctx.sql.query<{ time_zone: string }>(`SELECT time_zone FROM organizations`)).rows[0]
        .time_zone;
      expect(zone).toBe('Asia/Ho_Chi_Minh');

      // 23:59 on 31/12 in Ho Chi Minh City is 16:59 UTC: still the old year, which was marked done.
      const before = await service().run(new Date(Date.UTC(h.next - 1, 11, 31, 16, 59)));
      expect(before).toEqual({ status: 'ALREADY_DONE', year: h.year });
      expect(await rows(id)).toEqual([]);
      // 00:00 on 01/01 there is 17:00 UTC of the 31st: the new year.
      const after = await service().run(new Date(Date.UTC(h.next - 1, 11, 31, 17, 0)));
      expect(after).toMatchObject({ status: 'COMPLETED', year: h.next });
      expect(await rows(id)).toHaveLength(1);
    });
  });

  describe('a year with no budget yet (FR-5.8a)', () => {
    it('FR-5.8a: waits for a budget with the reason no budget, and is attached when a version of the year is approved', async () => {
      const u = await unit(false);
      const id = await approved(u);

      await passOn();

      expect(await rows(id)).toEqual([
        expect.objectContaining({ unattached_reason: 'NO_BUDGET', attached_version_id: null, origin: 'YEAR_START' }),
      ]);
      const version = await h.budgetFor(u, { total: 100_000_000_000, year: h.next });
      expect(await rows(id)).toEqual([
        expect.objectContaining({ unattached_reason: null, attached_version_id: version.id }),
      ]);
    });
  });

  describe('one pass for a year (idempotence, the mark of the pass)', () => {
    it('BR-MF1-09e: the pass leaves its mark, tells the Audit Trail once, and a second pass the same day makes nothing', async () => {
      const id = await approved(await unit());
      const told = (await events('BUDGET_COMMITMENT.YEAR_START_RUN')).length;

      const first = await passOn();
      const again = await passOn();

      expect(first).toMatchObject({ status: 'COMPLETED', reported: true });
      expect(again).toEqual({ status: 'ALREADY_DONE', year: h.next });
      expect(await rows(id)).toHaveLength(1);
      expect(await runRow()).toMatchObject({ completed: true, run_count: 1 });
      expect((await events('BUDGET_COMMITMENT.YEAR_START_RUN')).slice(told).map((event) => event.after)).toEqual([
        expect.objectContaining({ year: h.next, runCount: 1, created: expect.any(Number) as number }),
      ]);
      const created = (await events('BUDGET_COMMITMENT.CREATED')).filter(
        (event) => event.after.origin === 'YEAR_START',
      );
      expect(created.length).toBeGreaterThan(0);
      expect(created.every((event) => event.actor_kind === 'SYSTEM')).toBe(true);
    });

    it('BR-MF1-09e: it runs on 01/01 and not on other days: the year of the deployment was marked done, and a year that was done is not read again', async () => {
      const id = await approved(await unit());

      expect(await passOn(`${h.year}-12-31`)).toEqual({ status: 'ALREADY_DONE', year: h.year });
      expect(await rows(id)).toEqual([]);
      expect(await passOn(`${h.next}-01-01`)).toMatchObject({ status: 'COMPLETED' });
      expect(await passOn(`${h.next}-06-15`)).toEqual({ status: 'ALREADY_DONE', year: h.next });
      expect(await rows(id)).toHaveLength(1);
    });

    it('BR-MF1-09e: an organization that never had a pass makes nothing backwards: the first pass only marks its year', async () => {
      const id = await approved(await unit());
      await h.ctx.sql.query(`DELETE FROM year_start_commitment_runs`);

      expect(await passOn()).toEqual({ status: 'BASELINE', year: h.next });

      expect(await rows(id)).toEqual([]);
      expect(await runRow()).toMatchObject({ completed: true, created_count: 0 });
    });

    it('BR-MF1-09e: two instances that run at once make one commitment for each request, and one of them reports', async () => {
      const id = await approved(await unit());
      pretendBusinessToday(h.ctx.app, `${h.next}-01-01`);

      const both = await Promise.all([service().run(new Date()), service().run(new Date())]);

      expect(await rows(id)).toHaveLength(1);
      expect(both.filter((result) => result.status === 'COMPLETED' && result.reported)).toHaveLength(1);
      expect(await runRow()).toMatchObject({ completed: true });
    });
  });

  describe('the order of the locks: the request, then the year (the order of the budgets)', () => {
    it('BR-MF1-09e: a request withdrawn while the pass waits for its row is read in its new state, and gets no commitment', async () => {
      const id = await approved(await unit());
      const holder = await h.openClient();
      await holder.query('BEGIN');
      await holder.query(`SELECT 1 FROM access_requests WHERE id = $1 FOR UPDATE`, [id]);
      pretendBusinessToday(h.ctx.app, `${h.next}-01-01`);
      let pass: Promise<unknown> = Promise.resolve();
      try {
        pass = service().run(new Date());
        await waitForLockWaiters(h.ctx.sql, 1);
        await holder.query(`UPDATE access_requests SET ${ENDED.WITHDRAWN} WHERE id = $1`, [id]);
      } finally {
        await holder.query('COMMIT');
        await holder.end();
      }
      await pass;

      expect(await rows(id)).toEqual([]);
    });

    it('BR-MF1-09e: the pass holds the row of the request before it asks for the year of the Cost Center, and writes nothing while it waits', async () => {
      const u = await unit();
      const id = await approved(u);
      const holder = await h.openClient();
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        budgetYearLockKey(u.department.unitId, h.next),
      ]);
      pretendBusinessToday(h.ctx.app, `${h.next}-01-01`);
      let pass: Promise<unknown> = Promise.resolve();
      try {
        pass = service().run(new Date());
        await waitForLockWaiters(h.ctx.sql, 1);
        // It waits for the year with the row of the request already its own: nobody else can take the row (the first lock of the order), and nothing is written.
        await expect(
          h.ctx.sql.query(`SELECT 1 FROM access_requests WHERE id = $1 FOR UPDATE NOWAIT`, [id]),
        ).rejects.toMatchObject({
          code: '55P03',
        });
        expect(await rows(id)).toEqual([]);
      } finally {
        await holder.query('COMMIT');
        await holder.end();
      }
      await pass;

      expect(await rows(id)).toHaveLength(1);
    });
  });
});
