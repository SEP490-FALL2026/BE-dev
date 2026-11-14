import { YearStartCommitmentsService } from '../../../src/modules/requests/year-start-commitments/year-start-commitments.service';
import { GroupHarness, type Colleague } from '../../support/group-harness';
import { pretendBusinessToday } from '../../support/pretend-today';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();

interface CommitmentRow {
  year: number;
  amount_minor: string;
  origin: string;
  seat_monthly_minor: string | null;
}

/**
 * The commitment of 01/01 is what the approval kept of the year after (`QĐ-111ak`, `QĐ-111k`, R-46, M-13), over the real approval: the
 * numbers are the fixed ones of T-RQ2 and T-XY1 (`SPEC` §8). The business day is pretended for the sending and the approval (15/11, 20/11)
 * and then for the pass (01/01 of the next year); the plans are priced by changing the subscription, as a price changes in the catalog.
 */
describe('the commitment of 01/01 is what the approval kept (T-RQ2 for 01/01, T-XY1, QĐ-111ak) over PostgreSQL', () => {
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  beforeEach(async () => {
    // The year of the suite is done (as it is once its pass ran), and nothing is for the year that begins: the pass of a test is the first of it.
    await h.ctx.sql.query(
      `INSERT INTO year_start_commitment_runs (organization_id, year, started_at, completed_at)
       SELECT id, $1, now(), now() FROM organizations ON CONFLICT DO NOTHING`,
      [h.year],
    );
    await h.ctx.sql.query(`DELETE FROM year_start_commitment_runs WHERE year = $1`, [h.next]);
  });

  afterEach(() => jest.restoreAllMocks());

  /** A department with room in the budget of this year and the next, whose people are in it since 01/01 (the fixed days come before the real one). */
  const unit = async (): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-KEPT${counter}`);
    await h.roomFor(made);
    const first = `${h.year}-01-01`;
    await h.ctx.sql.query(
      `UPDATE employees SET hire_date = $2 WHERE id IN (SELECT employee_id FROM employee_placements WHERE department_id = $1)`,
      [made.department.id, first],
    );
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = $2 WHERE department_id = $1`, [
      made.department.id,
      first,
    ]);
    await h.ctx.sql.query(`UPDATE department_head_periods SET valid_from = $2 WHERE department_id = $1`, [
      made.department.id,
      first,
    ]);

    return made;
  };
  const setPrice = (subscriptionId: string, monthly: number) =>
    h.ctx.sql.query(`UPDATE subscriptions SET unit_price_minor = $2, price_reporting_minor = $2 WHERE id = $1`, [
      subscriptionId,
      monthly,
    ]);
  /** A plan of that kind at that price a month, and the subscription that sets the price. */
  const planAt = async (kind: 'K1' | 'K2', monthly: number) => {
    const subscription = await h.subscription(100, kind);
    await setPrice(subscription, monthly);

    return { subscription, plan: await h.planOf(subscription) };
  };
  /** The people of a department for a group: they are made on the real day, and the fixed day comes after their start. */
  const people = async (u: Unit, count: number): Promise<Colleague[]> => {
    const made = await h.colleagues(u, count);
    await h.ctx.sql.query(`UPDATE employees SET hire_date = $2 WHERE id = ANY($1::uuid[])`, [
      made.map((person) => person.employeeId),
      `${h.year}-01-01`,
    ]);

    return made;
  };
  /** A request of the member for months of use (null: no end), sent on by the head and approved as spend by the approver on `day`. */
  const approvedOn = async (u: Unit, plan: string, termMonths: number | null, day: string): Promise<string> => {
    pretendBusinessToday(h.ctx.app, day);
    const sent = await h.sent(u.member, plan, { termMonths });
    await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.sendOn([sent.id], u.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return sent.id;
  };
  const kept = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ amount_minor: string; next_year_amount_minor: string | null }>(
        `SELECT amount_minor::text, next_year_amount_minor::text FROM access_requests WHERE id = $1`,
        [requestId],
      )
    ).rows[0];
  const passOn = (day = `${h.next}-01-01`) => {
    pretendBusinessToday(h.ctx.app, day);

    return h.ctx.app.get(YearStartCommitmentsService, { strict: false }).run(new Date());
  };
  const rows = async (requestId: string): Promise<CommitmentRow[]> =>
    (
      await h.ctx.sql.query<CommitmentRow>(
        `SELECT year, amount_minor::text, origin::text, seat_monthly_minor::text
           FROM budget_commitments WHERE request_id = $1 AND year = $2`,
        [requestId, h.next],
      )
    ).rows;
  /** The group of these people for months of use, sent on and approved as spend on `day`, every person approved. */
  const groupApprovedOn = async (u: Unit, plan: string, group: readonly Colleague[], day: string): Promise<string> => {
    pretendBusinessToday(h.ctx.app, day);
    const id = await h.groupWaiting(u, plan, group, { termMonths: 9 });
    await h
      .decideSpendLines(
        id,
        { lines: group.map((person) => ({ employeeId: person.employeeId, decision: 'APPROVE' })) },
        h.boss.account,
      )
      .expect(200);

    return id;
  };
  /** A seat of the group granted to the person by the IT Admin and carried out. */
  const granted = async (requestId: string, subscriptionId: string, person: Colleague): Promise<void> => {
    const task = h.dataOf<{ task: { id: string } }>(
      await h.grantLine({ requestId, subscriptionId, beneficiaryEmployeeId: person.employeeId }, h.it1).expect(201),
    ).task;
    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Invited by work email' }).expect(200);
  };

  it('T-RQ2 (K1): 600.000 for 9 months approved on 15/11 holds 1.200.000 and keeps 4.200.000; the price of 01/01 is 650.000 and the commitment of 01/01 is still 4.200.000', async () => {
    const u = await unit();
    const { subscription, plan } = await planAt('K1', 600_000);
    const id = await approvedOn(u, plan, 9, `${h.year}-11-15`);
    expect(await kept(id)).toEqual({ amount_minor: '1200000', next_year_amount_minor: '4200000' });

    await setPrice(subscription, 650_000);
    await passOn();

    expect(await rows(id)).toEqual([
      { year: h.next, amount_minor: '4200000', origin: 'YEAR_START', seat_monthly_minor: '650000' },
    ]);
  });

  it('T-RQ2 (K2, no end): 375.000 approved on 20/11 holds 750.000 and keeps 4.500.000 (R-46); the price of 01/01 is 400.000 and the commitment is 4.800.000', async () => {
    const u = await unit();
    const { subscription, plan } = await planAt('K2', 375_000);
    const id = await approvedOn(u, plan, null, `${h.year}-11-20`);
    expect(await kept(id)).toEqual({ amount_minor: '750000', next_year_amount_minor: '4500000' });

    await setPrice(subscription, 400_000);
    await passOn();

    expect(await rows(id)).toEqual([
      { year: h.next, amount_minor: '4800000', origin: 'YEAR_START', seat_monthly_minor: '400000' },
    ]);
  });

  // A request for a group is for a plan of a shared pool (`K2`): the numbers of T-XY1 are the same, the months of use are 9 from 15/11.
  it('T-XY1: a group of three at 600.000 for 9 months from 15/11 keeps 3 × 4.200.000 = 12.600.000, and every person approved and not yet granted holds it on 01/01', async () => {
    const u = await unit();
    const { subscription, plan } = await planAt('K2', 600_000);
    const group = await people(u, 3);
    const id = await groupApprovedOn(u, plan, group, `${h.year}-11-15`);
    const lines = await h.ctx.sql.query<{ amount_minor: string }>(
      `SELECT amount_minor::text FROM access_request_line_amounts WHERE request_id = $1 AND budget_year = $2 AND NOT held`,
      [id, h.next],
    );
    expect(lines.rows.map((row) => row.amount_minor)).toEqual(['4200000', '4200000', '4200000']);
    expect((await kept(id)).next_year_amount_minor).toBe('12600000');

    await setPrice(subscription, 650_000);
    await passOn();

    expect((await rows(id)).map((row) => row.amount_minor)).toEqual(['12600000']);
  });

  it('T-XY1: the same group, granted, one person leaves (their seat is closed before 31/12): 01/01 holds 2 × 4.200.000 = 8.400.000', async () => {
    const u = await unit();
    const { subscription, plan } = await planAt('K2', 600_000);
    const group = await people(u, 3);
    const id = await groupApprovedOn(u, plan, group, `${h.year}-11-15`);
    for (const person of group) await granted(id, subscription, person);
    // The person who leaves: their seat is closed the day after it began, long before 31/12.
    await h.ctx.sql.query(
      `UPDATE license_assignments SET valid_until = valid_from + 1
        WHERE employee_id = $2 AND id IN (SELECT assignment_id FROM provisioning_tasks WHERE request_id = $1)`,
      [id, group[2].employeeId],
    );
    await setPrice(subscription, 650_000);

    await passOn();

    expect((await rows(id)).map((row) => row.amount_minor)).toEqual(['8400000']);
  });

  it('QĐ-111ak: a request of an older release, which kept nothing, is counted by the months to the end of its seat at the price of 01/01', async () => {
    const u = await unit();
    const { subscription, plan } = await planAt('K1', 600_000);
    const id = await approvedOn(u, plan, 9, `${h.year}-11-15`);
    // An older release kept no number of the year after, and ended the right on the day it named.
    await h.ctx.sql.query(
      `UPDATE access_requests SET next_year_amount_minor = NULL, term_months = NULL, expected_end_date = $2 WHERE id = $1`,
      [id, `${h.next}-03-31`],
    );
    await setPrice(subscription, 650_000);

    await passOn();

    expect((await rows(id)).map((row) => row.amount_minor)).toEqual([String(3 * 650_000)]);
  });
});
