import { NextYearReminderService } from '../../../src/modules/budgets/year-end/next-year-reminder.service';
import { addDays } from '../../support/department-harness';
import { BudgetHarness } from '../../support/budget-harness';
import { pretendBusinessToday } from '../../support/pretend-today';

const h = new BudgetHarness();

/**
 * B-4, `QĐ-111am`: on 01/12 and then every Monday, Finance and the spending approver are told which Cost Centers have no approved budget of
 * the year after, once for each Cost Center and day, and no more once a version is approved. The days are those of the year of the suite: 01/12
 * (a Tuesday in 2026), the first Monday after it (07/12/2026) and the day after that Monday, which is neither.
 */
describe('the reminder of the budget of the year after, from 01/12 and every Monday (B-4, QĐ-111am; integration, real PostgreSQL)', () => {
  let counter = 0;
  let approver = '';
  const service = () => h.ctx.app.get(NextYearReminderService, { strict: false });

  /** 01/12 of the year of the suite, the first Monday after it (never the 1st) and the day after that, which is not a Monday. */
  const december = (() => {
    const first = `${h.year}-12-01`;
    const sinceMonday = (new Date(`${first}T00:00:00.000Z`).getUTCDay() + 6) % 7;
    const monday = addDays(first, 7 - sinceMonday);

    return { first, monday, tuesday: addDays(monday, 1), before: `${h.year}-11-30`, january: `${h.next}-01-04` };
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
  /** A department with a Cost Center and no budget of the year after. */
  const bare = async () => (await h.departmentWithHead(`P-NYR${(counter += 1)}`)).department.unitId;
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

  it('tells again on the first Monday after, with a key of its own day, and on no day between: not the Tuesday after, not the day before 01/12', async () => {
    const lacking = await bare();
    await passOn(december.first);

    await passOn(december.before);
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

  it('stops once a version of the year after is approved, and tells nothing from 01/01, when the year after is the year that runs', async () => {
    const unit = await h.departmentWithHead(`P-NYR${(counter += 1)}`);
    const lacking = unit.department.unitId;
    await passOn(december.first);
    expect(await noticesOf(lacking)).toHaveLength(2);

    await passOn(december.january);
    expect(await noticesOf(lacking)).toHaveLength(2);

    const proposal = await h.budgetProposed(unit.head, lacking, undefined, h.next);
    await h.current(proposal.id);
    await passOn(december.monday);
    expect(await noticesOf(lacking)).toHaveLength(2);
  });
});
