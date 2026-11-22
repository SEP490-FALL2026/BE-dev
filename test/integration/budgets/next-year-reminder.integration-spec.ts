import { NextYearReminderService } from '../../../src/modules/budgets/year-end/next-year-reminder.service';
import { addDays } from '../../support/department-harness';
import { BudgetHarness } from '../../support/budget-harness';
import { pretendBusinessToday } from '../../support/pretend-today';

const h = new BudgetHarness();

/**
 * B-4, `QĐ-111am`: on 01/12 and then every Monday until a version is approved, Finance and the spending approver are told which Cost Centers
 * have no approved budget of the year, once for each Cost Center and day: in December of the year after, from January of the year that runs.
 * The days are those of the year of the suite: 01/12 (a Tuesday in 2026), the first Monday after it (07/12/2026), the day after that Monday,
 * which is neither, and the first Mondays of January.
 */
describe('the reminder of the budget of the year after, from 01/12 and every Monday until a version is approved (B-4, QĐ-111am; integration, real PostgreSQL)', () => {
  let counter = 0;
  let approver = '';
  const service = () => h.ctx.app.get(NextYearReminderService, { strict: false });

  const sinceMonday = (day: string) => (new Date(`${day}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  /**
   * 01/12 of the year of the suite, the first Monday after it (never the 1st) and the day after that, which is not a Monday; a day of November
   * that is no Monday; and the first two Mondays of January of the year after.
   */
  const december = (() => {
    const first = `${h.year}-12-01`;
    const monday = addDays(first, 7 - sinceMonday(first));
    const newYear = `${h.next}-01-01`;
    const january = sinceMonday(newYear) === 0 ? newYear : addDays(newYear, 7 - sinceMonday(newYear));

    return {
      first,
      monday,
      tuesday: addDays(monday, 1),
      quietNovember: addDays(first, -2 - ((sinceMonday(first) + 6) % 7)),
      january,
      secondJanuary: addDays(january, 7),
    };
  })();

  /** The notices of the reminder for the Cost Center, with who was told and the key of the notice. */
  const noticesOf = async (costCenterId: string) =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown>; event_key: string }>(
        `SELECT recipient_employee_id, params, event_key FROM in_app_notifications
          WHERE code = 'BUDGET_NEXT_YEAR_MISSING' AND subject_id = $1 ORDER BY event_key, recipient_employee_id`,
        [costCenterId],
      )
    ).rows;
  const passOn = (day: string) => {
    pretendBusinessToday(h.ctx.app, day);

    return service().noticeDue(new Date());
  };
  /** A department with a Cost Center that has the budget of the year that runs and none of the year after. */
  const bare = async () => {
    const unit = await h.departmentWithHead(`P-NYR${(counter += 1)}`);
    await h.current((await h.budgetProposed(unit.head, unit.department.unitId, undefined, h.year)).id);

    return unit.department.unitId;
  };
  const bothTold = () => [h.finance.employeeId, approver].sort();

  beforeAll(async () => {
    await h.start();
    const boss = await h.staff(await h.departmentWithUnit('P-NYR-BOSS'), 'NYR-BOSS');
    await h.setRole('SPENDING_APPROVER', boss);
    approver = boss.employeeId;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  afterEach(() => jest.restoreAllMocks());

  it('tells Finance and the spending approver, once each, on 01/12, for a Cost Center with no approved budget of the year after, and not for one that has it', async () => {
    const lacking = await bare();
    const covered = await h.departmentWithHead(`P-NYR${(counter += 1)}`);
    const proposal = await h.budgetProposed(covered.head, covered.department.unitId, undefined, h.next);
    await h.current(proposal.id);

    await passOn(december.first);

    const told = await noticesOf(lacking);
    expect(told.map((notice) => notice.recipient_employee_id).sort()).toEqual(bothTold());
    expect(told.every((notice) => notice.event_key === `nextYearBudget:${lacking}:${december.first}`)).toBe(true);
    expect(told.map((notice) => notice.params)).toEqual([
      { costCenterId: lacking, year: h.next },
      { costCenterId: lacking, year: h.next },
    ]);
    expect(await noticesOf(covered.department.unitId)).toEqual([]);
  });

  it('writes nothing the second time on the same day, and nothing more when two instances run at once', async () => {
    const lacking = await bare();

    await Promise.all([passOn(december.first), passOn(december.first)]);
    await passOn(december.first);

    expect(await noticesOf(lacking)).toHaveLength(2);
  });

  it('tells again on the first Monday after, with a key of its own day, and on no day between: not the Tuesday after, not a day of November', async () => {
    const lacking = await bare();
    await passOn(december.first);

    await passOn(december.quietNovember);
    expect(await noticesOf(lacking)).toHaveLength(2);
    await passOn(december.tuesday);
    expect(await noticesOf(lacking)).toHaveLength(2);
    await passOn(december.monday);

    const told = await noticesOf(lacking);
    expect(told).toHaveLength(4);
    expect([...new Set(told.map((notice) => notice.event_key))]).toEqual([
      `nextYearBudget:${lacking}:${december.first}`,
      `nextYearBudget:${lacking}:${december.monday}`,
    ]);
  });

  it('goes on from January, every Monday, for the year that runs, until a version of it is approved: no end at 01/01 (B-4)', async () => {
    const unit = await h.departmentWithHead(`P-NYR${(counter += 1)}`);
    const lacking = unit.department.unitId;
    await passOn(december.first);
    expect(await noticesOf(lacking)).toHaveLength(2);

    await passOn(december.january);
    const january = await noticesOf(lacking);
    expect(january).toHaveLength(4);
    // The year after has become the year that runs: it is the year the notice of January names.
    expect(
      january.filter((notice) => notice.event_key.endsWith(december.january)).map((notice) => notice.params),
    ).toEqual([
      { costCenterId: lacking, year: h.next },
      { costCenterId: lacking, year: h.next },
    ]);
    await passOn(december.secondJanuary);
    expect(await noticesOf(lacking)).toHaveLength(6);

    const proposal = await h.budgetProposed(unit.head, lacking, undefined, h.next);
    await h.current(proposal.id);
    await passOn(addDays(december.secondJanuary, 7));
    expect(await noticesOf(lacking)).toHaveLength(6);
  });

  it('stops in December once a version of the year after is approved', async () => {
    const unit = await h.departmentWithHead(`P-NYR${(counter += 1)}`);
    const lacking = unit.department.unitId;
    await passOn(december.first);
    expect(await noticesOf(lacking)).toHaveLength(2);

    const proposal = await h.budgetProposed(unit.head, lacking, undefined, h.next);
    await h.current(proposal.id);
    await passOn(december.monday);
    expect(await noticesOf(lacking)).toHaveLength(2);
  });

  it('sends one aggregated notice per recipient with subject null and costCenterCount across multiple missing cost centers', async () => {
    const missingUnits = await Promise.all([
      h.departmentWithHead(`P-NYR${(counter += 1)}`),
      h.departmentWithHead(`P-NYR${(counter += 1)}`),
      h.departmentWithHead(`P-NYR${(counter += 1)}`),
    ]);
    for (const unit of missingUnits) {
      await h.current((await h.budgetProposed(unit.head, unit.department.unitId, undefined, h.year)).id);
    }
    const covered = await h.departmentWithHead(`P-NYR${(counter += 1)}`);
    await h.current((await h.budgetProposed(covered.head, covered.department.unitId, undefined, h.next)).id);

    const { rows: unapprovedBefore } = await h.ctx.sql.query<{ count: string }>(
      `SELECT count(DISTINCT d.unit_cost_center_id)::text AS count
         FROM departments d
         JOIN cost_centers cc ON cc.id = d.unit_cost_center_id
        WHERE d.status = 'ACTIVE' AND cc.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM budget_versions v
             WHERE v.cost_center_id = cc.id AND v.year = $1 AND v.state = 'APPROVED'
          )`,
      [h.next],
    );
    const totalMissing = Number(unapprovedBefore[0].count);
    expect(totalMissing).toBeGreaterThanOrEqual(3);

    const secondMonday = addDays(december.monday, 7);
    const sinceRow = await h.ctx.sql.query<{ now: string }>(`SELECT clock_timestamp()::text AS now`);
    await passOn(secondMonday);
    await passOn(secondMonday);

    const aggregated = (
      await h.ctx.sql.query<{
        recipient_employee_id: string;
        subject_type: string | null;
        subject_id: string | null;
        params: Record<string, unknown>;
        event_key: string;
      }>(
        `SELECT recipient_employee_id, subject_type, subject_id, params, event_key
           FROM in_app_notifications
          WHERE code = 'BUDGET_NEXT_YEAR_MISSING' AND created_at >= $1::timestamptz
          ORDER BY recipient_employee_id`,
        [sinceRow.rows[0].now],
      )
    ).rows;

    expect(aggregated).toHaveLength(2);
    expect(aggregated.map((row) => row.recipient_employee_id).sort()).toEqual(bothTold());
    expect(aggregated.every((row) => row.subject_type === null && row.subject_id === null)).toBe(true);
    expect(aggregated.every((row) => row.event_key === `nextYearBudget:${h.next}:${secondMonday}`)).toBe(true);
    expect(aggregated.map((row) => row.params)).toEqual([
      { year: h.next, costCenterCount: totalMissing },
      { year: h.next, costCenterCount: totalMissing },
    ]);
  });
});
