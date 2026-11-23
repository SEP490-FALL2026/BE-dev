import { NextYearReminderService } from '../../../src/modules/budgets/year-end/next-year-reminder.service';
import { addDays } from '../../support/department-harness';
import { BudgetHarness } from '../../support/budget-harness';
import { pretendBusinessToday } from '../../support/pretend-today';

const h = new BudgetHarness();

/**
 * B-4, `QĐ-111am`: on 01/12 and then every Monday until a version is approved, Finance and the spending approver are told how many Cost Centers
 * have no approved budget of the year, once for each person and day: in December of the year after, from January of the year that runs.
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

  let since = '1970-01-01T00:00:00.000Z';

  /** The reminder notices written since the start of the current test, ordered by event key and recipient. */
  const noticesForDay = async (day: string) =>
    (
      await h.ctx.sql.query<{
        recipient_employee_id: string;
        subject_type: string | null;
        subject_id: string | null;
        params: Record<string, unknown>;
        event_key: string;
      }>(
        `SELECT recipient_employee_id, subject_type, subject_id, params, event_key FROM in_app_notifications
          WHERE code = 'BUDGET_NEXT_YEAR_MISSING' AND event_key = $1 AND created_at >= $2::timestamptz
          ORDER BY recipient_employee_id`,
        [`nextYearBudget:${h.next}:${day}`, since],
      )
    ).rows;
  const noticesAll = async () =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown>; event_key: string }>(
        `SELECT recipient_employee_id, params, event_key FROM in_app_notifications
          WHERE code = 'BUDGET_NEXT_YEAR_MISSING' AND created_at >= $1::timestamptz
          ORDER BY event_key, recipient_employee_id`,
        [since],
      )
    ).rows;
  const unapprovedUnits: { head: Awaited<ReturnType<typeof h.departmentWithHead>>['head']; unitId: string }[] = [];
  const missingCount = async () => {
    const { rows } = await h.ctx.sql.query<{ count: string }>(
      `SELECT count(DISTINCT cc.id)::text AS count
         FROM cost_centers cc
         JOIN departments d ON d.id = cc.department_id
        WHERE d.status = 'ACTIVE' AND cc.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM budget_versions v
             WHERE v.cost_center_id = cc.id AND v.year = $1 AND v.state = 'APPROVED'
          )`,
      [h.next],
    );
    return Number(rows[0].count);
  };
  const passOn = (day: string) => {
    pretendBusinessToday(h.ctx.app, day);

    return service().noticeDue(new Date());
  };
  /** A department with a Cost Center that has the budget of the year that runs and none of the year after. */
  const bare = async () => {
    const unit = await h.departmentWithHead(`P-NYR${(counter += 1)}`);
    await h.current((await h.budgetProposed(unit.head, unit.department.unitId, undefined, h.year)).id);
    unapprovedUnits.push({ head: unit.head, unitId: unit.department.unitId });

    return unit.department.unitId;
  };
  const approveAllLacking = async () => {
    while (unapprovedUnits.length > 0) {
      const unit = unapprovedUnits.pop()!;
      const proposal = await h.budgetProposed(unit.head, unit.unitId, undefined, h.next);
      await h.current(proposal.id);
    }
  };
  const bothTold = () => [h.finance.employeeId, approver].sort();

  beforeAll(async () => {
    await h.start();
    const boss = await h.staff(await h.departmentWithUnit('P-NYR-BOSS'), 'NYR-BOSS');
    await h.setRole('SPENDING_APPROVER', boss);
    approver = boss.employeeId;

    await h.lockedCycle(h.next);
    try {
      const { rows: initialMissing } = await h.ctx.sql.query<{ id: string }>(
        `SELECT cc.id FROM cost_centers cc JOIN departments d ON d.id = cc.department_id
          WHERE d.status = 'ACTIVE' AND cc.status = 'ACTIVE'
            AND NOT EXISTS (
              SELECT 1 FROM budget_versions v
               WHERE v.cost_center_id = cc.id AND v.year = $1 AND v.state = 'APPROVED'
            )`,
        [h.next],
      );
      for (const { id: costCenterId } of initialMissing) {
        const res = await h.createVersion({ source: 'BASELINE', costCenterId, year: h.next }).expect(201);
        const versionId = h.dataOf<{ version: { id: string } }>(res).version.id;
        await h.sendVersion(versionId).expect(200);
        await h.makeCurrent(versionId);
      }
    } finally {
      await h.reopenedCycle(h.next);
    }
    expect(await missingCount()).toBe(0);
  }, 240000);

  beforeEach(async () => {
    const { rows } = await h.ctx.sql.query<{ now: string }>(`SELECT clock_timestamp()::text AS now`);
    since = rows[0].now;
  });

  afterAll(async () => {
    await h.stop();
  });

  afterEach(() => jest.restoreAllMocks());

  it('tells Finance and the spending approver once each on 01/12 when at least one Cost Center lacks an approved next-year budget', async () => {
    await bare();
    const covered = await h.departmentWithHead(`P-NYR${(counter += 1)}`);
    const proposal = await h.budgetProposed(covered.head, covered.department.unitId, undefined, h.next);
    await h.current(proposal.id);
    const totalMissing = await missingCount();

    await passOn(december.first);

    const told = await noticesForDay(december.first);
    expect(told.map((notice) => notice.recipient_employee_id).sort()).toEqual(bothTold());
    expect(told.every((notice) => notice.subject_type === null && notice.subject_id === null)).toBe(true);
    expect(told.map((notice) => notice.params)).toEqual([
      { year: h.next, costCenterCount: totalMissing },
      { year: h.next, costCenterCount: totalMissing },
    ]);
  });

  it('writes nothing the second time on the same day, and nothing more when two instances run at once', async () => {
    await bare();
    const m1 = december.monday;

    await Promise.all([passOn(m1), passOn(m1)]);
    await passOn(m1);

    expect(await noticesForDay(m1)).toHaveLength(2);
  });

  it('tells again on the first Monday after, with a key of its own day, and on no day between: not the Tuesday after, not a day of November', async () => {
    await bare();
    const jan1 = december.january;
    const jan2 = addDays(jan1, 7);
    await passOn(jan1);

    await passOn(december.quietNovember);
    expect(await noticesAll()).toHaveLength(2);
    await passOn(addDays(jan1, 1));
    expect(await noticesAll()).toHaveLength(2);
    await passOn(jan2);

    const told = await noticesAll();
    expect(told).toHaveLength(4);
    expect([...new Set(told.map((notice) => notice.event_key))]).toEqual([
      `nextYearBudget:${h.next}:${jan1}`,
      `nextYearBudget:${h.next}:${jan2}`,
    ]);
  });

  it('goes on from January, every Monday, for the year that runs, until every missing Cost Center has an approved version: no end at 01/01 (B-4)', async () => {
    await approveAllLacking();
    const unit = await h.departmentWithHead(`P-NYR${(counter += 1)}`);
    const lacking = unit.department.unitId;
    const totalMissing = await missingCount();
    const jan3 = addDays(december.january, 14);
    const jan4 = addDays(december.january, 21);
    const jan5 = addDays(december.january, 28);
    await passOn(jan3);
    expect(await noticesAll()).toHaveLength(2);

    await passOn(jan4);
    const afterJan4 = await noticesAll();
    expect(afterJan4).toHaveLength(4);
    // The year after has become the year that runs: the notice in January still names that year.
    expect(afterJan4.filter((notice) => notice.event_key.endsWith(jan4)).map((notice) => notice.params)).toEqual([
      { year: h.next, costCenterCount: totalMissing },
      { year: h.next, costCenterCount: totalMissing },
    ]);

    const proposal = await h.budgetProposed(unit.head, lacking, undefined, h.next);
    await h.current(proposal.id);
    await passOn(jan5);
    expect(await noticesAll()).toHaveLength(4);
  });

  it('stops in December once every Cost Center has an approved version of the year after', async () => {
    await approveAllLacking();
    const unit = await h.departmentWithHead(`P-NYR${(counter += 1)}`);
    const lacking = unit.department.unitId;
    const m2 = addDays(december.monday, 7);
    const m3 = addDays(december.monday, 14);
    await passOn(m2);
    expect(await noticesAll()).toHaveLength(2);

    const proposal = await h.budgetProposed(unit.head, lacking, undefined, h.next);
    await h.current(proposal.id);
    await passOn(m3);
    expect(await noticesAll()).toHaveLength(2);
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

    const totalMissing = await missingCount();
    expect(totalMissing).toBeGreaterThanOrEqual(3);

    const m4 = addDays(december.monday, 21);
    await passOn(m4);
    await passOn(m4);

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
        [since],
      )
    ).rows;

    expect(aggregated).toHaveLength(2);
    expect(aggregated.map((row) => row.recipient_employee_id).sort()).toEqual(bothTold());
    expect(aggregated.every((row) => row.subject_type === null && row.subject_id === null)).toBe(true);
    expect(aggregated.every((row) => row.event_key === `nextYearBudget:${h.next}:${m4}`)).toBe(true);
    expect(aggregated.map((row) => row.params)).toEqual([
      { year: h.next, costCenterCount: totalMissing },
      { year: h.next, costCenterCount: totalMissing },
    ]);
  });
});
