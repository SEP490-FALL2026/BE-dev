import request from 'supertest';
import type { Department, Person } from '../../support/request-harness';
import { TransferHarness } from '../../support/transfer-harness';

const h = new TransferHarness();

interface MeWire {
  roles: string[];
  managerScope: unknown;
  upcomingUnits: { departmentId: string; departmentCode: string; effectiveFrom: string; costCenterId: string | null }[];
}

/**
 * `qd103-department-effective-year`, review R2 (F-033…F-036): the head of a department that starts next year is named, holds the
 * grant of MANAGER and does the budget work of that year; the role MANAGER is not effective for them (QĐ-93a, QĐ-95e), so every other
 * MANAGER route refuses them; `/me` says which units they are to head; a transfer cannot be moved to a day before the department
 * starts; the notices of the budget work reach them.
 */
describe('the head of a department that starts next year, after the review (integration, real PostgreSQL)', () => {
  let counter = 0;
  let start: string;
  let origin: Department;
  const code = (prefix: string) => `${prefix}${(counter += 1)}`;
  const asAdmin = () => ({ Authorization: `Bearer ${h.admin}` });

  const upcoming = async (): Promise<Department> => {
    const department = await h.departmentWithUnit(code('P-R2'));
    await h.ctx.sql.query(`UPDATE departments SET effective_from = $2 WHERE id = $1`, [department.id, start]);

    return department;
  };
  const futureHead = async (department: Department): Promise<Person> => {
    const person = await h.unplacedStaff(code('R2H'), 'MANAGER');
    await request(h.server())
      .post(`/api/v1/employees/${person.employeeId}/first-placements`)
      .set(asAdmin())
      .send({ departmentId: department.id, effectiveFrom: start })
      .expect(201);
    await request(h.server())
      .post(`/api/v1/departments/${department.id}/head-assignments`)
      .set(asAdmin())
      .send({ employeeId: person.employeeId, effectiveFrom: start })
      .expect(200);

    return person;
  };

  beforeAll(async () => {
    await h.start();
    start = `${h.next}-01-01`;
    origin = await h.departmentWithUnit('P-R2O');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('says in `/me` which units they are to head, while the role MANAGER stays not effective (F-033, F-034)', async () => {
    const department = await upcoming();
    const head = await futureHead(department);

    const me = h.dataOf<MeWire>(await request(h.server()).get('/api/v1/me').set(h.as(head.account)).expect(200));

    expect(me.roles).toEqual(['MANAGER']);
    expect(me.managerScope).toBeNull();
    expect(me.upcomingUnits).toEqual([
      {
        departmentId: department.id,
        departmentCode: department.code,
        departmentName: expect.any(String) as unknown,
        effectiveFrom: start,
        costCenterId: department.unitId,
      },
    ]);
  });

  it('lets them do the budget work, and refuses them every other MANAGER route (F-033)', async () => {
    const department = await upcoming();
    const head = await futureHead(department);

    await h.submitProposal({ year: h.next, lines: h.twoLines() }, head.account).expect(201);
    await h.mine(head.account, h.next).expect(200);

    for (const path of [
      '/api/v1/dashboards/manager',
      '/api/v1/personnel-notices',
      '/api/v1/spend-queue',
      `/api/v1/departments/${department.id}/employees`,
    ]) {
      const refused = await request(h.server()).get(path).set(h.as(head.account));
      expect([path, refused.status]).toEqual([path, 403]);
    }
  });

  it('still refuses the budget work to a person who was never granted MANAGER (guard unchanged)', async () => {
    const employee = await h.staff(origin, code('R2E'));

    const refused = await h.submitProposal({ year: h.next, lines: h.twoLines() }, employee.account).expect(403);

    expect(h.codeOf(refused)).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it('turns away the move of a transfer to a day before the destination starts, and accepts the day it starts (F-035)', async () => {
    const department = await upcoming();
    const mover = await h.veteran(origin, code('R2T'));
    const why = { reason: 'The department asked for another day', grounds: h.grounds };
    const recorded = await h.recorded({
      employeeId: mover.employeeId,
      toDepartmentId: department.id,
      effectiveOn: start,
      grounds: h.grounds,
    });

    const early = await h.rescheduleTransfer(recorded.id, { newEffectiveOn: h.day(30), ...why });
    const later = await h.rescheduleTransfer(recorded.id, { newEffectiveOn: `${h.next}-01-08`, ...why });

    expect([early.status, h.codeOf(early)]).toEqual([422, 'DEPARTMENT_TRANSFER.DEPARTMENT_NOT_YET_EFFECTIVE']);
    expect(later.status).toBe(200);
    const placements = await h.placements(mover.employeeId);
    expect(placements.every((row) => row.department_id !== department.id || row.valid_from >= start)).toBe(true);
  });

  it('tells the ceiling to the head who is to take office, and gives the proposal back to them, not to a department with no head (F-036)', async () => {
    const department = await upcoming();
    const head = await futureHead(department);
    const division = {
      sharedPoolReserve: h.money(0),
      departments: (
        await h.ctx.sql.query<{ id: string }>(
          `SELECT id FROM departments WHERE status = 'ACTIVE' AND effective_from <= make_date($1, 12, 31)`,
          [h.next],
        )
      ).rows.map((row) => ({
        departmentId: row.id,
        signedCommitments: h.money(1),
        plannedSeats: h.money(0),
        priority: h.money(0),
        explanation: 'Basis of the ceiling',
      })),
    };
    await request(h.server())
      .put(`/api/v1/budget-cycles/${h.next}/department-ceilings`)
      .set(h.as(h.finance))
      .send(division)
      .expect(200);
    await request(h.server()).post(`/api/v1/budget-cycles/${h.next}/publish`).set(h.as(h.finance)).expect(201);
    const cycleId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM budget_cycles WHERE year = $1`, [h.next]))
      .rows[0].id;

    const told = await h.budgetNoticesOf('BUDGET_DEPARTMENT_CEILING_PUBLISHED', cycleId);
    const proposal = await h.budgetProposed(head, department.unitId);
    await h.giveBack(proposal.id, { reason: 'Add the seats' }, h.finance).expect(200);
    const notices = (
      await h.ctx.sql.query<{ code: string; recipient_employee_id: string }>(
        `SELECT code, recipient_employee_id FROM in_app_notifications WHERE subject_id = $1`,
        [proposal.id],
      )
    ).rows;

    expect(
      told.filter((notice) => notice.params.departmentId === department.id).map((n) => n.recipient_employee_id),
    ).toEqual([head.employeeId]);
    expect(notices.filter((notice) => notice.recipient_employee_id === head.employeeId).map((n) => n.code)).toContain(
      'BUDGET_PROPOSAL_RETURNED',
    );
    expect(
      notices.some(
        (notice) =>
          notice.recipient_employee_id === h.finance.employeeId && notice.code === 'BUDGET_PROPOSAL_TASK_WAITING',
      ),
    ).toBe(false);
  });
});
