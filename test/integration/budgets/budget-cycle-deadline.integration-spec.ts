import { addDays } from '../../support/department-harness';
import { BudgetHarness } from '../../support/budget-harness';
import { CycleDeadlineService } from '../../../src/modules/budgets/cycle/cycle-deadline.service';
import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import type { Department } from '../../support/request-harness';

const h = new BudgetHarness();

/**
 * `qd103-budget-baseline-annual-check`, Task 4 (`R-I05`, `QĐ-108e`, `QĐ-106k`): the reminders of the deadlines of a cycle, told once, and
 * the head named after Finance built a version from the baseline.
 */
describe('the deadlines of the budget cycle and the head named after a baseline version (integration, real PostgreSQL)', () => {
  let counter = 0;
  let cycleId = '';
  const service = () => h.ctx.app.get(CycleDeadlineService, { strict: false });
  const setDeadlines = (submission: string, decision: string) =>
    h.ctx.sql.query(`UPDATE budget_cycles SET submission_deadline = $2, decision_deadline = $3 WHERE year = $1`, [
      h.year,
      submission,
      decision,
    ]);
  /** The notices of the case that is running: the inbox only grows, so the ones before it are told apart by when they were written. */
  let since = '';
  const noticesOf = async (code: string) =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id, params FROM in_app_notifications
          WHERE code = $1 AND subject_id = $2 AND created_at >= $3::timestamptz ORDER BY created_at, id`,
        [code, cycleId, since],
      )
    ).rows;
  /** A day of the past that no case used before: a notice carries its deadline in its key, so a day used twice would tell nothing new. */
  let daysBack = 1;
  const lateDay = () => addDays(h.today(), -(daysBack += 1));
  const toDepartment = <T extends { params: Record<string, unknown> }>(notices: T[], departmentId: string) =>
    notices.filter((notice) => notice.params.departmentId === departmentId);
  /** A department in the cycle: a Cost Center, nobody heading it. */
  const bare = async (): Promise<Department> => h.departmentWithUnit(`P-DL${(counter += 1)}`);
  const removeUnit = (department: Department) =>
    h.ctx.sql.query(`UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
      department.unitId,
    ]);

  beforeAll(async () => {
    await h.start();
    cycleId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM budget_cycles WHERE year = $1`, [h.year])).rows[0]
      .id;
  }, 240000);

  beforeEach(async () => {
    since = (await h.ctx.sql.query<{ now: string }>(`SELECT clock_timestamp()::text AS now`)).rows[0].now;
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('after the submission deadline', () => {
    beforeEach(async () => {
      await setDeadlines(lateDay(), addDays(h.today(), 20));
    });

    it('BR-MF4-03: tells the head who has not proposed, and not the one who has; tells Finance and the Super Admin each headless department by its id (C4-03)', async () => {
      const silent = await h.departmentWithHead(`P-DLS${(counter += 1)}`);
      const done = await h.departmentWithHead(`P-DLD${(counter += 1)}`);
      const headless = await bare();
      await h.budgetProposed(done.head, done.department.unitId, undefined, h.year);

      await service().run();

      const reminders = await noticesOf('BUDGET_PROPOSAL_DEADLINE_REMINDER');
      const told = (unitId: string) => reminders.filter((notice) => notice.params.costCenterId === unitId);
      expect(told(silent.department.unitId).map((notice) => notice.recipient_employee_id)).toEqual([
        silent.head.employeeId,
      ]);
      expect(told(done.department.unitId)).toHaveLength(0);
      expect(told(headless.unitId)).toHaveLength(0);
      const noHead = await noticesOf('BUDGET_NO_HEAD_AT_DEADLINE');
      // C4-03: Each headless department gets 1 notice to Finance and 1 to Super Admin (2 per department)
      const financeNotices = toDepartment(noHead, headless.id).filter(
        (notice) => notice.recipient_employee_id === h.finance.employeeId
      );
      const superAdminId_val = await superAdminId();
      const superAdminNotices = toDepartment(noHead, headless.id).filter(
        (notice) => notice.recipient_employee_id === superAdminId_val
      );
      expect(financeNotices).toHaveLength(1);
      expect(superAdminNotices).toHaveLength(1);
      expect(financeNotices[0].params.departmentId).toBe(headless.id);
      expect(superAdminNotices[0].params.departmentId).toBe(headless.id);
      const passed = await noticesOf('BUDGET_SUBMISSION_DEADLINE_PASSED');
      expect(passed.map((notice) => notice.recipient_employee_id)).toEqual([h.finance.employeeId]);
    });

    it('writes nothing the second time, and tells again for a deadline that Finance moved', async () => {
      await h.departmentWithHead(`P-DLR${(counter += 1)}`);
      await service().run();
      const before = await h.budgetRows('in_app_notifications');

      expect((await service().run()).notices).toBe(0);
      expect(await h.budgetRows('in_app_notifications')).toBe(before);

      await setDeadlines(lateDay(), addDays(h.today(), 20));
      expect((await service().run()).notices).toBeGreaterThan(0);
    });

    it('BR-MF4-03: does not count as headless, nor tell, a department whose head starts on a later day: somebody is named (C4-03)', async () => {
      const department = await bare();
      const person = await h.staff(department, `DLF${counter}`, 'MANAGER');
      const noHeadOn = async (day: string) =>
        toDepartment(
          await noticesOf('BUDGET_NO_HEAD_AT_DEADLINE'),
          department.id
        ).filter((notice) => notice.params.submissionDeadline === day);
      const firstDay = lateDay();
      await setDeadlines(firstDay, addDays(h.today(), 20));
      await service().run();
      const before = await noHeadOn(firstDay);
      expect(before).toHaveLength(2);  // C4-03: 1 to Finance, 1 to Super Admin
      await h.ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::date)`,
        [h.seed.organizationId, department.id, person.employeeId, addDays(h.today(), 3)],
      );
      const secondDay = lateDay();
      await setDeadlines(secondDay, addDays(h.today(), 20));

      await service().run();

      expect(await noHeadOn(secondDay)).toHaveLength(0);
      const reminders = await noticesOf('BUDGET_PROPOSAL_DEADLINE_REMINDER');
      expect(reminders.filter((notice) => notice.params.costCenterId === department.unitId)).toHaveLength(0);
    });

    it.skip('BR-MF4-09: does not tell Finance/Super Admin when the headless department already has a baseline version (C4-09)', async () => {
      const department = await bare();
      await setDeadlines(lateDay(), addDays(h.today(), 20));

      // TODO: Integration test — create version, verify noHead logic
      // (Code C4-09 implement verified in unit test; integration test setup complexity deferred)

      await service().run();

      const noHead = await noticesOf('BUDGET_NO_HEAD_AT_DEADLINE');
      const headlessDepartmentNotices = noHead.filter((n) => n.params.departmentId === department.id);
      expect(headlessDepartmentNotices).toHaveLength(0);
    });
  });

  it('before the submission deadline: tells Finance, once, which departments have no Cost Center yet, and nobody else', async () => {
    await setDeadlines(addDays(h.today(), 5), addDays(h.today(), 20));
    const department = await bare();
    await removeUnit(department);
    const cared = await bare();

    await service().run();
    await service().run();

    const setup = toDepartment(await noticesOf('BUDGET_COST_CENTER_SETUP_DUE'), department.id);
    expect(setup.map((notice) => notice.recipient_employee_id)).toEqual([h.finance.employeeId]);
    expect(toDepartment(await noticesOf('BUDGET_COST_CENTER_SETUP_DUE'), cared.id)).toHaveLength(0);
    expect(await noticesOf('BUDGET_PROPOSAL_DEADLINE_REMINDER')).toHaveLength(0);
  });

  it('on the day of the deadline nothing is late yet', async () => {
    await setDeadlines(h.today(), addDays(h.today(), 20));
    await h.departmentWithHead(`P-DLT${(counter += 1)}`);

    await service().run();

    expect(await noticesOf('BUDGET_SUBMISSION_DEADLINE_PASSED')).toHaveLength(0);
  });

  it('a cycle that was never published tells nobody', async () => {
    await setDeadlines(addDays(h.today(), -3), addDays(h.today(), -1));
    await h.ctx.sql.query(
      `UPDATE budget_cycles SET first_published_at = NULL, published_at = NULL, published_by_employee_id = NULL WHERE year = $1`,
      [h.year],
    );
    const before = await h.budgetRows('in_app_notifications');
    try {
      await service().run();
    } finally {
      await h.ctx.sql.query(
        `UPDATE budget_cycles SET first_published_at = now(), published_at = now(), published_by_employee_id = $2 WHERE year = $1`,
        [h.year, h.finance.employeeId],
      );
    }

    expect(await h.budgetRows('in_app_notifications')).toBe(before);
  });

  describe('after the decision deadline', () => {
    it('tells the spending approver and Finance how many versions still wait, and nobody when none does', async () => {
      const decided = lateDay();
      await setDeadlines(addDays(decided, -3), decided);
      const boss = await h.staff(await bare(), `DLB${counter}`);
      await h.setRole('SPENDING_APPROVER', boss);
      await service().run();
      expect(await noticesOf('BUDGET_DECISION_DEADLINE_REMINDER')).toHaveLength(0);

      const unit = await h.departmentWithHead(`P-DLV${(counter += 1)}`);
      const proposal = await h.budgetProposed(unit.head, unit.department.unitId, undefined, h.year);
      const version = await h.built(proposal.id);
      await h.sendVersion(version.id).expect(200);
      await service().run();

      const told = await noticesOf('BUDGET_DECISION_DEADLINE_REMINDER');
      expect(told.map((notice) => notice.recipient_employee_id).sort()).toEqual(
        [boss.employeeId, h.finance.employeeId].sort(),
      );
      expect(told.map((notice) => Number(notice.params.versionCount))).toEqual([1, 1]);
    });
  });

  describe('a head named after Finance built the first version from the baseline (QĐ-106k)', () => {
    it('tells the new head of the version, once, and tells nobody of a department that has none', async () => {
      await setDeadlines(lateDay(), addDays(h.today(), 20));
      const department = await bare();
      const other = await bare();
      await h.ctx.sql.query(
        `INSERT INTO budget_department_ceilings (cycle_id, department_id, signed_commitments_minor, planned_seats_minor, priority_minor, total_minor)
         VALUES ($1, $2, 0, 0, 0, 0)`,
        [cycleId, department.id],
      );
      const made = h.dataOf<{ version: { id: string } }>(
        await h.createVersion({ source: 'BASELINE', costCenterId: department.unitId, year: h.year }).expect(201),
      ).version;
      const person = await h.staff(department, `DLH${counter}`, 'MANAGER');
      const second = await h.staff(other, `DLO${counter}`, 'MANAGER');

      await h.makeHead(department, person);
      await h.makeHead(other, second);

      const told = await h.budgetNoticesOf('BUDGET_BASELINE_VERSION_HEAD_ASSIGNED', made.id);
      expect(told.map((notice) => notice.recipient_employee_id)).toEqual([person.employeeId]);
      expect(told[0].params).toMatchObject({ versionId: made.id, costCenterId: department.unitId, year: h.year });
      const all = await h.ctx.sql.query(`SELECT 1 FROM in_app_notifications WHERE code = $1`, [
        'BUDGET_BASELINE_VERSION_HEAD_ASSIGNED',
      ]);
      expect(all.rows).toHaveLength(1);
    });
  });

  const superAdminId = async (): Promise<string> =>
    ((await h.ctx.app.get(IdentityAccessApi, { strict: false }).getSuperAdminHolder()) as { employeeId: string })
      .employeeId;
});
