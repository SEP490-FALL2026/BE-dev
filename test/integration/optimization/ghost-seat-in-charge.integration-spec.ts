import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { isWeekend } from '../../../src/core/working-days';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import type { ApiAccount } from '../../support/api-accounts';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

const postReclaim = (id: string, account: ApiAccount) =>
  request(w.server()).post(`/api/v1/ghost-seat-recommendations/${id}/reclaim`).set(w.as(account));

const postReturn = (id: string, account: ApiAccount, reason = 'Cannot remove yet') =>
  request(w.server()).post(`/api/v1/ghost-seat-recommendations/${id}/return`).set(w.as(account)).send({ reason });

const appointSubstitute = (departmentId: string, substituteEmployeeId: string, reason = 'Cover') =>
  request(w.server())
    .post(`/api/v1/departments/${departmentId}/it-substitutes`)
    .set({ Authorization: `Bearer ${w.admin}` })
    .send({ substituteEmployeeId, reason });

const decideReclaim = (account: ApiAccount, recommendationId: string) =>
  request(w.server())
    .post('/api/v1/ghost-seat-decisions')
    .set(w.as(account))
    .send(
      w.checklists.withYes('5.4', {
        items: [{ recommendationId }],
        choice: 'RECLAIM',
        reason: 'Unused seat',
      }),
    );

const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;

const nextWeekday = async (from = 1): Promise<Date> => {
  const reads = w.ctx.app.get(OrganizationReadApi);
  for (let offset = from; offset < from + 14; offset += 1) {
    const instant = w.dayOf(offset);
    if (!isWeekend(await reads.businessToday(instant))) return instant;
  }
  throw new Error('no weekday found');
};

describe('acting IT Admin gate on ghost-seat reclaim, reopen, return and notice routing (integration, real PostgreSQL)', () => {
  let otherIt: ApiAccount;
  let subIt: ApiAccount;

  beforeAll(async () => {
    await w.startWorld();
    const otherEmp = await w.person('E-H11-OTH');
    otherIt = await w.account('E-H11-OTH', otherEmp, 'IT_ADMIN');
    const subEmp = await w.person('E-H11-SUB');
    subIt = await w.account('E-H11-SUB', subEmp, 'IT_ADMIN');
  }, 240000);

  afterAll(async () => {
    await w.stop();
  });

  const makeOwner = async (tag: string) => {
    const emp = await w.person(`E-H11-IT-${tag}`);
    const account = await w.account(`E-H11-IT-${tag}`, emp, 'IT_ADMIN');
    const dept = await w.headedDepartment(`P-H11-${tag}`, emp);

    return { emp, account, dept };
  };

  const makeG2In = async (tag: string, departmentId: string) => {
    const subscription = await w.worldSubscription(10, 'K2');
    const holder = await w.personIn(`E-H11-G2-${tag}`, departmentId);
    const assignmentId = await w.seatOf(holder, subscription);
    await w.leave(holder);

    return w.seedRecommendation({
      group: 'G2',
      state: 'OPEN',
      tier: 'ACTION',
      assignmentId,
    });
  };

  const makeDecidedReclaimIn = async (tag: string, departmentId: string, head: ApiAccount) => {
    const seat = await w.seatIn(`E-H11-G4-${tag}`, departmentId);
    const recId = await w.seedRecommendation({
      group: 'G4',
      state: 'AWAITING_DECISION',
      tier: 'ACTION',
      assignmentId: seat.assignmentId,
      deciderDepartmentId: departmentId,
      decisionDueOn: addDays(w.today(), 5),
    });
    const res = await decideReclaim(head, recId).expect(201);
    const taskId = String(dataOf<{ items: { revocationTaskId: string }[] }>(res).items[0].revocationTaskId);

    return { recId, taskId };
  };

  it('G2 reclaim: refuses non-acting IT Admin and locked in-charge without sub (403); allows usable in-charge and appointed sub (bySubstitute=true)', async () => {
    const owner = await makeOwner('G2A');
    const g2Active = await makeG2In('A', owner.dept.departmentId);

    expect(w.codeOf(await postReclaim(g2Active, otherIt).expect(403))).toBe('GHOST_SEAT.NOT_IN_CHARGE');
    expect((await w.ghostRows('id = $1', [g2Active]))[0].state).toBe('OPEN');

    await postReclaim(g2Active, owner.account).expect(200);
    const activeAudit = (await w.auditOf('GHOST_SEAT_RECOMMENDATION', g2Active)).find(
      (event) => event.action === 'GHOST_SEAT.RECLAIM_OPENED',
    );
    expect(activeAudit?.after).toMatchObject({ byInCharge: true });
    expect(activeAudit?.after).not.toHaveProperty('bySubstitute');

    const locked = await makeOwner('G2B');
    const g2Locked = await makeG2In('B', locked.dept.departmentId);
    await w.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE employee_id = $1`, [locked.emp]);

    expect(w.codeOf(await postReclaim(g2Locked, subIt).expect(403))).toBe('GHOST_SEAT.NOT_IN_CHARGE');

    await appointSubstitute(locked.dept.departmentId, subIt.employeeId, 'In-charge locked').expect(201);
    await postReclaim(g2Locked, subIt).expect(200);
    const subAudit = (await w.auditOf('GHOST_SEAT_RECOMMENDATION', g2Locked)).find(
      (event) => event.action === 'GHOST_SEAT.RECLAIM_OPENED',
    );
    expect(subAudit?.after).toMatchObject({ byInCharge: false, bySubstitute: true });
  });

  it('G3/G4 reopen: refuses non-acting IT Admin and locked in-charge without sub (403); allows usable in-charge and appointed sub (bySubstitute=true)', async () => {
    const owner = await makeOwner('RO1');
    const decided = await makeDecidedReclaimIn('RO1', owner.dept.departmentId, owner.dept.head);
    const notBefore = (await w.ghostRows('id = $1', [decided.recId]))[0].revocation_not_before ?? '';
    await w.ctx.sql.query(`UPDATE provisioning_tasks SET not_before = $2::date WHERE id = $1`, [
      decided.taskId,
      addDays(w.today(), -1),
    ]);
    await w.claim(decided.taskId, owner.account).expect(200);
    await w.fail(decided.taskId, { reason: 'Failed' }, owner.account).expect(200);
    await w.closeFailed(decided.taskId, { reason: 'Later' }, owner.account).expect(200);
    expect(notBefore).toBeTruthy();

    expect(w.codeOf(await postReclaim(decided.recId, otherIt).expect(403))).toBe('GHOST_SEAT.NOT_IN_CHARGE');

    await w.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE employee_id = $1`, [owner.emp]);
    expect(w.codeOf(await postReclaim(decided.recId, subIt).expect(403))).toBe('GHOST_SEAT.NOT_IN_CHARGE');

    await appointSubstitute(owner.dept.departmentId, subIt.employeeId, 'Cover reopen').expect(201);
    await postReclaim(decided.recId, subIt).expect(200);
    const reopenAudit = (await w.auditOf('GHOST_SEAT_RECOMMENDATION', decided.recId)).find(
      (event) => event.action === 'GHOST_SEAT.REOPENED',
    );
    expect(reopenAudit?.after).toMatchObject({ bySubstitute: true });
  });

  it('return to head: refuses non-acting IT Admin and locked in-charge without sub (403); allows usable in-charge and appointed sub (bySubstitute=true)', async () => {
    const owner = await makeOwner('RT1');
    const first = await makeDecidedReclaimIn('RT1', owner.dept.departmentId, owner.dept.head);

    expect(w.codeOf(await postReturn(first.recId, otherIt).expect(403))).toBe('GHOST_SEAT.NOT_IN_CHARGE');
    expect((await w.ghostRows('id = $1', [first.recId]))[0].state).toBe('RECLAIM_DECIDED');

    await postReturn(first.recId, owner.account).expect(200);
    const ownerAudit = (await w.auditOf('GHOST_SEAT_RECOMMENDATION', first.recId)).find(
      (event) => event.action === 'GHOST_SEAT.RETURNED',
    );
    expect(ownerAudit?.after).toMatchObject({ byInCharge: true });
    expect(ownerAudit?.after).not.toHaveProperty('bySubstitute');

    const locked = await makeOwner('RT2');
    const second = await makeDecidedReclaimIn('RT2', locked.dept.departmentId, locked.dept.head);
    await w.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE employee_id = $1`, [locked.emp]);

    expect(w.codeOf(await postReturn(second.recId, subIt).expect(403))).toBe('GHOST_SEAT.NOT_IN_CHARGE');

    await appointSubstitute(locked.dept.departmentId, subIt.employeeId, 'Cover return').expect(201);
    await postReturn(second.recId, subIt).expect(200);
    const subAudit = (await w.auditOf('GHOST_SEAT_RECOMMENDATION', second.recId)).find(
      (event) => event.action === 'GHOST_SEAT.RETURNED',
    );
    expect(subAudit?.after).toMatchObject({ byInCharge: false, bySubstitute: true });
  });

  it('H18 notices: routes GHOST_SEAT_ACTION_TIER and GHOST_SEAT_DECISION_OVERDUE to substitute ?? inCharge, falling back to Super Admin', async () => {
    const ownerSub = await makeOwner(`H18A-${randomUUID().slice(0, 6)}`);
    await appointSubstitute(ownerSub.dept.departmentId, subIt.employeeId, 'Cover notices').expect(201);
    const subSeat = await w.seatIn(`E-H18-S-${randomUUID().slice(0, 6)}`, ownerSub.dept.departmentId);
    const actionRec = await w.seedRecommendation({
      group: 'G4',
      state: 'OPEN',
      tier: 'ACTION',
      assignmentId: subSeat.assignmentId,
    });
    const overdueSubSeat = await w.seatIn(`E-H18-OS-${randomUUID().slice(0, 6)}`, ownerSub.dept.departmentId);
    const overdueSubRec = await w.seedRecommendation({
      group: 'G4',
      state: 'AWAITING_DECISION',
      tier: 'REVIEW',
      assignmentId: overdueSubSeat.assignmentId,
      deciderDepartmentId: ownerSub.dept.departmentId,
      decisionDueOn: '2026-11-02',
    });

    const ownerNone = await makeOwner(`H18B-${randomUUID().slice(0, 6)}`);
    await w.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE employee_id = $1`, [ownerNone.emp]);
    const noneSeat = await w.seatIn(`E-H18-N-${randomUUID().slice(0, 6)}`, ownerNone.dept.departmentId);
    const fallbackActionRec = await w.seedRecommendation({
      group: 'G3',
      state: 'OPEN',
      tier: 'ACTION',
      assignmentId: noneSeat.assignmentId,
    });
    const overdueNoneSeat = await w.seatIn(`E-H18-ON-${randomUUID().slice(0, 6)}`, ownerNone.dept.departmentId);
    const fallbackOverdueRec = await w.seedRecommendation({
      group: 'G4',
      state: 'AWAITING_DECISION',
      tier: 'REVIEW',
      assignmentId: overdueNoneSeat.assignmentId,
      deciderDepartmentId: ownerNone.dept.departmentId,
      decisionDueOn: '2026-11-02',
    });

    await w.followUp(await nextWeekday(1));

    const { rows: adminRows } = await w.ctx.sql.query<{ employee_id: string }>(
      `SELECT u.employee_id FROM app_users u JOIN role_grants g ON g.app_user_id = u.id
        WHERE g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL LIMIT 1`,
    );
    const superAdminEmp = adminRows[0].employee_id;

    expect(
      (await w.noticesOf('GHOST_SEAT_ACTION_TIER', subIt.employeeId)).some(
        (n) => n.params.recommendationId === actionRec,
      ),
    ).toBe(true);
    expect(
      (await w.noticesOf('GHOST_SEAT_ACTION_TIER', ownerSub.emp)).some((n) => n.params.recommendationId === actionRec),
    ).toBe(false);
    expect(
      (await w.noticesOf('GHOST_SEAT_DECISION_OVERDUE', subIt.employeeId)).some(
        (n) => n.params.recommendationId === overdueSubRec,
      ),
    ).toBe(true);

    expect(
      (await w.noticesOf('GHOST_SEAT_ACTION_TIER', superAdminEmp)).some(
        (n) => n.params.recommendationId === fallbackActionRec,
      ),
    ).toBe(true);
    expect(
      (await w.noticesOf('GHOST_SEAT_DECISION_OVERDUE', superAdminEmp)).some(
        (n) => n.params.recommendationId === fallbackOverdueRec,
      ),
    ).toBe(true);
  });
});
