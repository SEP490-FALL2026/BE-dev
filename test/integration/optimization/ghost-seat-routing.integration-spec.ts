import { addWorkingDays } from '../../../src/core/working-days';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

const todayOf = (day: Date) => w.ctx.app.get(OrganizationReadApi).businessToday(day);

/** A seat of a new holder placed in a department, on a subscription of the world. */
const holder = (code: string, departmentId: string) => w.seatIn(code, departmentId);

describe('the routing of G3/G4 to the head of the department (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await w.startWorld();
  }, 240000);

  afterAll(async () => {
    await w.stop();
  });

  it('US-10-06 AC-16, Q-96: a G4 REVIEW goes to the head with a due day 5 working days from the day it enters; MONITOR stays open; a G3 ACTION also tells the IT Admin; one notice each a week', async () => {
    const dept = await w.headedDepartment('P-RT1');
    const e1 = await holder('E-RT1-A', dept.departmentId);
    const e2 = await holder('E-RT1-B', dept.departmentId);
    const e3 = await holder('E-RT1-C', dept.departmentId);
    const review = await w.seedRecommendation({
      group: 'G4',
      state: 'OPEN',
      tier: 'REVIEW',
      assignmentId: e1.assignmentId,
    });
    const monitor = await w.seedRecommendation({
      group: 'G4',
      state: 'OPEN',
      tier: 'MONITOR',
      assignmentId: e2.assignmentId,
    });
    const day = w.nextDay();

    const tally = await w.followUp(day);

    expect(tally?.routed).toBe(1);
    const today = await todayOf(day);
    const [routed] = await w.ghostRows('id = $1', [review]);
    expect(routed).toMatchObject({
      state: 'AWAITING_DECISION',
      decider_department_id: dept.departmentId,
      decision_due_on: addWorkingDays(today, 5, new Set()),
    });
    expect(routed.routed_at).not.toBeNull();
    expect((await w.ghostRows('id = $1', [monitor]))[0]).toMatchObject({ state: 'OPEN', routed_at: null });
    expect(await w.noticesOf('GHOST_SEAT_NEW', dept.headEmployeeId)).toHaveLength(1);
    expect(await w.noticesOf('GHOST_SEAT_ACTION_TIER', w.worldItAdmin.employeeId)).toHaveLength(0);

    // A G3 ACTION in the same week: the head already has this week's notice (no second one), the IT Admin in charge gets the action tier.
    const action = await w.seedRecommendation({
      group: 'G3',
      state: 'OPEN',
      tier: 'ACTION',
      assignmentId: e3.assignmentId,
    });
    await w.followUp(day);

    expect((await w.ghostRows('id = $1', [action]))[0]).toMatchObject({ state: 'AWAITING_DECISION' });
    const news = await w.noticesOf('GHOST_SEAT_NEW', dept.headEmployeeId);
    expect(news).toHaveLength(1);
    expect(news[0].event_key).toMatch(/^GHOST_SEAT_NEW:.+:\d{4}-W\d{2}$/);
    expect(await w.noticesOf('GHOST_SEAT_ACTION_TIER', w.worldItAdmin.employeeId)).toHaveLength(1);
    const audit = await w.auditOf('GHOST_SEAT_RECOMMENDATION', review);
    expect(audit.map((event) => event.action)).toContain('GHOST_SEAT.ROUTED');
  });

  it('the seat of the head is in the same queue (the head decides on their own seat): the department of the holder decides, never another', async () => {
    const dept = await w.headedDepartment('P-RT2');
    const seat = {
      employeeId: dept.headEmployeeId,
      assignmentId: await w.seatOf(dept.headEmployeeId, await w.worldSubscription(5, 'K2')),
    };
    const rec = await w.seedRecommendation({
      group: 'G4',
      state: 'OPEN',
      tier: 'ACTION',
      assignmentId: seat.assignmentId,
    });

    await w.followUp();

    expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({
      state: 'AWAITING_DECISION',
      decider_department_id: dept.departmentId,
    });
    expect(await w.noticesOf('GHOST_SEAT_NEW', seat.employeeId)).toHaveLength(1);
  });

  it('US-10-06 AC-9, US-10-08 AC-4: a department with no head waits, the due day is counted and the Super Admin is told; a head named later takes it with the same due day', async () => {
    const department = await w.department('P-RT3', w.worldItAdmin.employeeId);
    const e1 = await holder('E-RT3-A', department.id);
    const rec = await w.seedRecommendation({
      group: 'G4',
      state: 'OPEN',
      tier: 'REVIEW',
      assignmentId: e1.assignmentId,
    });
    const day = w.nextDay();

    await w.followUp(day);

    const [waiting] = await w.ghostRows('id = $1', [rec]);
    expect(waiting).toMatchObject({ state: 'WAITING_FOR_HEAD', decider_department_id: department.id });
    expect(waiting.decision_due_on).toBe(addWorkingDays(await todayOf(day), 5, new Set()));
    const held = await w.ctx.sql.query(`SELECT 1 FROM held_department_notifications WHERE department_id = $1`, [
      department.id,
    ]);
    expect(held.rowCount).toBe(1);
    expect(
      (await w.noticesOf('GHOST_SEAT_WAITING_FOR_HEAD')).filter((n) => n.params.departmentId === department.id),
    ).toHaveLength(1);

    const head = await w.personIn('P-RT3-HEAD', department.id);
    await w.ctx.sql.query(
      `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, '2026-01-05')`,
      [w.seed.organizationId, department.id, head],
    );
    await w.followUp(w.nextDay());

    expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({
      state: 'AWAITING_DECISION',
      decision_due_on: waiting.decision_due_on,
    });
    expect(await w.auditOf('GHOST_SEAT_RECOMMENDATION', rec)).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'GHOST_SEAT.HEAD_ASSIGNED' })]),
    );
  });

  it('DA6-21: a head who leaves makes the queue wait (due day kept, Super Admin told); a returned recommendation comes back as returned when a head is named', async () => {
    const dept = await w.headedDepartment('P-RT4');
    const e1 = await holder('E-RT4-A', dept.departmentId);
    const e2 = await holder('E-RT4-B', dept.departmentId);
    const day = w.nextDay();
    const due = addWorkingDays(await todayOf(day), 5, new Set());
    const awaiting = await w.seedRecommendation({
      group: 'G4',
      state: 'AWAITING_DECISION',
      tier: 'REVIEW',
      assignmentId: e1.assignmentId,
      deciderDepartmentId: dept.departmentId,
      decisionDueOn: due,
    });
    const returned = await w.seedRecommendation({
      group: 'G3',
      state: 'RETURNED_TO_HEAD',
      tier: 'ACTION',
      assignmentId: e2.assignmentId,
      deciderDepartmentId: dept.departmentId,
      decisionDueOn: due,
      returnCount: 1,
    });
    await w.endHead(dept.departmentId);

    await w.followUp(day);

    expect((await w.ghostRows('id = $1', [awaiting]))[0]).toMatchObject({
      state: 'WAITING_FOR_HEAD',
      decision_due_on: due,
    });
    expect((await w.ghostRows('id = $1', [returned]))[0]).toMatchObject({
      state: 'WAITING_FOR_HEAD',
      decision_due_on: due,
    });
    expect(
      (await w.noticesOf('GHOST_SEAT_WAITING_FOR_HEAD')).filter((n) => n.params.departmentId === dept.departmentId),
    ).toHaveLength(1);

    const newHead = await w.personIn('P-RT4-H7', dept.departmentId);
    await w.ctx.sql.query(
      `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, '2026-01-07')`,
      [w.seed.organizationId, dept.departmentId, newHead],
    );
    await w.followUp(w.nextDay());

    expect((await w.ghostRows('id = $1', [awaiting]))[0]).toMatchObject({
      state: 'AWAITING_DECISION',
      decision_due_on: due,
    });
    expect((await w.ghostRows('id = $1', [returned]))[0]).toMatchObject({
      state: 'RETURNED_TO_HEAD',
      decision_due_on: due,
    });
  });
});
