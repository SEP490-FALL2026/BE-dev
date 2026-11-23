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
  /**
   * The people of a department for a group: they are made on the real day, and the fixed days come after their start, so the hire date and
   * the day they belong to the department (`valid_from` of the placement, the real day of today) go back to 01/01 as `unit()` does for the
   * first ones. Left at the real day, the people belong to the department only from today and the days after 15/11 count them out.
   */
  const people = async (u: Unit, count: number): Promise<Colleague[]> => {
    const made = await h.colleagues(u, count);
    const ids = made.map((person) => person.employeeId);
    await h.ctx.sql.query(`UPDATE employees SET hire_date = $2 WHERE id = ANY($1::uuid[])`, [ids, `${h.year}-01-01`]);
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = $2 WHERE employee_id = ANY($1::uuid[])`, [
      ids,
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

  it('T-RQ2 (K2, no end): 375.000 approved on 20/11 holds 750.000 and keeps 4.500.000 (R-46); even when the price of 01/01 is 400.000, the commitment stays 4.500.000 at the approval price', async () => {
    const u = await unit();
    const { subscription, plan } = await planAt('K2', 375_000);
    const id = await approvedOn(u, plan, null, `${h.year}-11-20`);
    expect(await kept(id)).toEqual({ amount_minor: '750000', next_year_amount_minor: '4500000' });

    await setPrice(subscription, 400_000);
    await passOn();

    expect(await rows(id)).toEqual([
      { year: h.next, amount_minor: '4500000', origin: 'YEAR_START', seat_monthly_minor: '375000' },
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

  it('B1A-04: one person of the group has their seat closed in March, before the term the approval counted: 01/01 holds their months to the day it closes at the price of the approval (3 × 600.000), not at the price of 01/01 (650.000)', async () => {
    const u = await unit();
    const { subscription, plan } = await planAt('K2', 600_000);
    const group = await people(u, 3);
    const id = await groupApprovedOn(u, plan, group, `${h.year}-11-15`);
    for (const person of group) await granted(id, subscription, person);
    // The seat of the third person closes on 31/03 of the year that begins; the term of the approval ran to 14/08 (9 months from 15/11).
    await h.ctx.sql.query(
      `UPDATE license_assignments SET valid_until = $3::date
        WHERE employee_id = $2 AND id IN (SELECT assignment_id FROM provisioning_tasks WHERE request_id = $1)`,
      [id, group[2].employeeId, `${h.next}-04-01`],
    );
    await setPrice(subscription, 650_000);

    await passOn();

    // 2 × 4.200.000 kept, and January to March at 600.000 for the one who closes; never 3 × 650.000.
    expect((await rows(id)).map((row) => row.amount_minor)).toEqual([String(2n * 4_200_000n + 3n * 600_000n)]);
  });

  it('B1A-01: a request approved in dollars by an older release is not counted by the number it kept (14.000 cents are not 14.000 dong): the months at the price of 01/01, and the audit trail says so', async () => {
    const u = await unit();
    const { subscription, plan } = await planAt('K1', 600_000);
    const id = await approvedOn(u, plan, 9, `${h.year}-11-15`);
    // An older release approved it in dollars: 7 months at 20.00 a month is 14.000 cents of the year after.
    await h.ctx.sql.query(
      `UPDATE access_requests SET amount_currency = 'USD', next_year_amount_minor = 14000 WHERE id = $1`,
      [id],
    );
    await setPrice(subscription, 650_000);

    await passOn();

    expect((await rows(id)).map((row) => row.amount_minor)).toEqual([String(9 * 650_000)]);
    const events = await h.ctx.sql.query<{ after: { currency: string; savedMinor: string; year: number } }>(
      `SELECT after FROM audit_events WHERE action = 'BUDGET_COMMITMENT.YEAR_START_SAVED_AMOUNT_IGNORED' AND resource_id = $1`,
      [id],
    );
    expect(events.rows.map((row) => row.after)).toEqual([
      expect.objectContaining({ currency: 'USD', savedMinor: '14000', year: h.next }),
    ]);
  });

  it('B1A-01: a person of a group whose kept line an older release wrote in dollars is counted by the months of their seat at the price of 01/01, the others by their kept line, and the audit trail names the person', async () => {
    const u = await unit();
    const { subscription, plan } = await planAt('K2', 600_000);
    const group = await people(u, 3);
    const id = await groupApprovedOn(u, plan, group, `${h.year}-11-15`);
    // The line of the last person is an older release's: 7 months at 20.00 a month, 14.000 cents. The table refuses a change of a line, so the
    // trigger that guards it is off for this one statement.
    await h.ctx.sql.query(
      `BEGIN;
       ALTER TABLE access_request_line_amounts DISABLE TRIGGER access_request_line_amounts_no_change;
       UPDATE access_request_line_amounts SET currency = 'USD', amount_minor = 14000
        WHERE request_id = '${id}' AND employee_id = '${group[2].employeeId}' AND budget_year = ${h.next} AND NOT held;
       ALTER TABLE access_request_line_amounts ENABLE TRIGGER access_request_line_amounts_no_change;
       COMMIT;`,
    );
    await setPrice(subscription, 650_000);

    await passOn();

    // Two people keep 4.200.000 each; the third is counted by the 9 months of use from 01/01 at 650.000, nothing of the 14.000 cents.
    expect((await rows(id)).map((row) => row.amount_minor)).toEqual([String(2 * 4_200_000 + 9 * 650_000)]);
    const events = await h.ctx.sql.query<{
      after: { employeeId: string; currency: string; savedMinor: string; year: number };
    }>(
      `SELECT after FROM audit_events WHERE action = 'BUDGET_COMMITMENT.YEAR_START_SAVED_AMOUNT_IGNORED' AND resource_id = $1`,
      [id],
    );
    expect(events.rows.map((row) => row.after)).toEqual([
      expect.objectContaining({
        employeeId: group[2].employeeId,
        currency: 'USD',
        savedMinor: '14000',
        year: h.next,
      }),
    ]);
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

  it('non-term-limited request keeps its approval price (100.000/month -> 1.200.000) across both year 1 and year 2 even when catalog price rises to 120.000', async () => {
    const u = await unit();
    const { subscription, plan } = await planAt('K2', 100_000);
    const id = await approvedOn(u, plan, null, `${h.year}-11-20`);
    expect(await kept(id)).toEqual({ amount_minor: '200000', next_year_amount_minor: '1200000' });

    await setPrice(subscription, 120_000);
    await passOn(`${h.next}-01-01`);
    await passOn(`${h.next + 1}-01-01`);

    const committed = await h.ctx.sql.query<CommitmentRow>(
      `SELECT year, amount_minor::text, origin::text, seat_monthly_minor::text
         FROM budget_commitments WHERE request_id = $1 AND origin = 'YEAR_START' ORDER BY year`,
      [id],
    );
    expect(committed.rows).toEqual([
      { year: h.next, amount_minor: '1200000', origin: 'YEAR_START', seat_monthly_minor: '100000' },
      { year: h.next + 1, amount_minor: '1200000', origin: 'YEAR_START', seat_monthly_minor: '100000' },
    ]);
  });
});
