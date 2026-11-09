import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { decisionDueOn } from '../../../src/modules/optimization/decision/decision-routing.policy';
import { addMonths } from '../../../src/core/fiscal-year';
import { pretendBusinessToday } from '../../support/pretend-today';
import type { ApiAccount } from '../../support/api-accounts';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

interface Wire {
  data: { items?: Record<string, unknown>[]; recommendation?: Record<string, unknown>; taskId?: string };
}
const dataOf = (response: request.Response) => (response.body as Wire).data;

const decide = (
  account: ApiAccount,
  recommendationId: string,
  choice: string,
  reason = 'Không dùng nữa',
  extra: object = {},
) =>
  request(w.server())
    .post('/api/v1/ghost-seat-decisions')
    .set(w.as(account))
    .send({ items: [{ recommendationId }], choice, reason, ...extra });
const giveBack = (account: ApiAccount, id: string, reason: unknown = 'Chưa gỡ được') =>
  request(w.server())
    .post(`/api/v1/ghost-seat-recommendations/${id}/return`)
    .set(w.as(account))
    .send(reason === undefined ? {} : { reason });
const reclaim = (account: ApiAccount, id: string) =>
  request(w.server()).post(`/api/v1/ghost-seat-recommendations/${id}/reclaim`).set(w.as(account));

/** A G4 waiting for the head of a department; the head reclaims it at once and the task is returned with its id. */
const reclaimed = async (tag: string, group: 'G3' | 'G4' = 'G4') => {
  const dept = await w.headedDepartment(`P-${tag}`);
  const seat = await w.seatIn(`E-${tag}`, dept.departmentId);
  const rec = await w.seedRecommendation({
    group,
    state: 'AWAITING_DECISION',
    tier: 'ACTION',
    assignmentId: seat.assignmentId,
    deciderDepartmentId: dept.departmentId,
    decisionDueOn: addDays(w.today(), 5),
  });
  const taskId = String(dataOf(await decide(dept.head, rec, 'RECLAIM').expect(201)).items?.[0].revocationTaskId);

  return { dept, seat, rec, taskId };
};

describe('the return of the IT Admin and the end of a reclaim the head decided (integration, real PostgreSQL)', () => {
  let it2: ApiAccount;

  beforeAll(async () => {
    await w.startWorld();
    it2 = await w.account('E-RET-IT2', await w.person('E-RET-IT2'), 'IT_ADMIN');
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await w.stop();
  });

  it('AC-10, OI-02: the IT Admin returns it with a reason: the task is cancelled, the head is told, the due day counts again from today; a second return is 409, no reason is 422, a G2 is 409', async () => {
    const { dept, rec, taskId } = await reclaimed('RT1');
    const today = w.today();

    const response = await giveBack(w.worldItAdmin.account, rec).expect(200);

    expect(dataOf(response).recommendation).toMatchObject({
      recommendationId: rec,
      state: 'RETURNED_TO_HEAD',
      returnCount: 1,
      decisionDueOn: decisionDueOn(today, 5, new Set()),
    });
    expect((await w.revocationOf(taskId)).status).toBe('CANCELLED');
    expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({
      state: 'RETURNED_TO_HEAD',
      return_count: 1,
      revocation_task_id: null,
    });
    expect(await w.noticesOf('GHOST_SEAT_RETURNED', dept.headEmployeeId)).toHaveLength(1);
    expect(
      (await w.auditOf('GHOST_SEAT_RECOMMENDATION', rec)).find((event) => event.action === 'GHOST_SEAT.RETURNED')
        ?.after,
    ).toMatchObject({ byInCharge: true });
    expect(w.codeOf(await giveBack(w.worldItAdmin.account, rec).expect(409))).toBe('GHOST_SEAT.ALREADY_RETURNED');

    const another = await reclaimed('RT1B');
    await giveBack(w.worldItAdmin.account, another.rec, '').expect(422);
    const subscription = await w.worldSubscription(5, 'K2');
    const leaver = await w.leaverSeat(subscription, 'E-RT1-G2');
    await w.leave(leaver.employeeId);
    await w.runRules();
    const [g2] = await w.g2Of(leaver.employeeId);
    expect(w.codeOf(await giveBack(w.worldItAdmin.account, g2.id).expect(409))).toBe('GHOST_SEAT.NOT_RETURNABLE');
  });

  it('AC-10 (re-decision): after a return the head reclaims again 3 days later: the same first day, no second notice to the holder, and the reason is added to the same live task without a 23505', async () => {
    const { dept, seat, rec, taskId } = await reclaimed('RT2');
    const before = (await w.ghostRows('id = $1', [rec]))[0].revocation_not_before;
    // Another reason for the same seat keeps the task alive when the head's reason is taken back.
    await w.open(seat.assignmentId, 'TIME_LIMITED_EXPIRY', { decision: { decidedRole: 'IT_ADMIN' } });
    expect((await giveBack(w.worldItAdmin.account, rec).expect(200)).status).toBe(200);
    expect((await w.revocationOf(taskId)).status).not.toBe('CANCELLED');

    const pretend = pretendBusinessToday(w.ctx.app, addDays(w.today(), 3));
    const again = dataOf(await decide(dept.head, rec, 'RECLAIM', 'Vẫn không dùng').expect(201)).items?.[0];
    pretend.mockRestore();

    expect(again).toMatchObject({ outcome: 'RECLAIM_DECIDED', notBefore: before, revocationTaskId: taskId });
    expect(await w.noticesOf('REVOCATION_UPCOMING', seat.employeeId)).toHaveLength(1);
    const { rows } = await w.ctx.sql.query(
      `SELECT withdrawn_at FROM provisioning_task_reasons WHERE task_id = $1 AND reference_id = $2 ORDER BY created_at`,
      [taskId, rec],
    );
    expect(rows.map((row: { withdrawn_at: Date | null }) => row.withdrawn_at !== null)).toEqual([true, false]);
  });

  it('AC-11, AC-12: after a return, a keep or an exemption of 6 months tells the holder the revocation is cancelled; an exemption of 13 months is 422 and tells nobody', async () => {
    const kept = await reclaimed('RT3');
    await giveBack(w.worldItAdmin.account, kept.rec).expect(200);
    await decide(kept.dept.head, kept.rec, 'KEEP', 'Vẫn cần').expect(201);
    expect(await w.noticesOf('REVOCATION_CANCELLED', kept.seat.employeeId)).toHaveLength(1);

    const exempt = await reclaimed('RT3B');
    await giveBack(w.worldItAdmin.account, exempt.rec).expect(200);
    const today = w.today();
    await decide(exempt.dept.head, exempt.rec, 'EXEMPT', 'Dự án', { exemptUntil: addMonths(today, 13) }).expect(422);
    expect(await w.noticesOf('REVOCATION_CANCELLED', exempt.seat.employeeId)).toHaveLength(0);
    await decide(exempt.dept.head, exempt.rec, 'EXEMPT', 'Dự án', { exemptUntil: addMonths(today, 6) }).expect(201);
    expect(await w.noticesOf('REVOCATION_CANCELLED', exempt.seat.employeeId)).toHaveLength(1);
    expect((await w.ghostRows('id = $1', [exempt.rec]))[0]).toMatchObject({
      state: 'CLOSED',
      close_reason: 'EXEMPTED',
    });
  });

  it('return while working: the IT Admin who took the task may return it (cancelled); another IT Admin is refused (409 TASK_IN_PROGRESS) and nothing changes', async () => {
    const mine = await reclaimed('RT4');
    const theirs = await reclaimed('RT4B');
    const notBefore = (await w.ghostRows('id = $1', [mine.rec]))[0].revocation_not_before ?? '';
    const pretend = pretendBusinessToday(w.ctx.app, notBefore);
    await w.claim(mine.taskId, w.worldItAdmin.account).expect(200);
    await w.claim(theirs.taskId, w.worldItAdmin.account).expect(200);

    await giveBack(w.worldItAdmin.account, mine.rec).expect(200);
    expect(w.codeOf(await giveBack(it2, theirs.rec).expect(409))).toBe('GHOST_SEAT.TASK_IN_PROGRESS');
    pretend.mockRestore();

    expect((await w.revocationOf(mine.taskId)).status).toBe('CANCELLED');
    expect((await w.ghostRows('id = $1', [theirs.rec]))[0]).toMatchObject({
      state: 'RECLAIM_DECIDED',
      return_count: 0,
    });
  });

  it('AC-12, AC-13 (Q-95, DA6-25): a task closed as failed leaves it RECLAIM_DECIDED; another IT Admin reclaims it again: a new task with the old first day, no notice, the duty with the head who decided', async () => {
    const { dept, seat, rec, taskId } = await reclaimed('RT5');
    const notBefore = (await w.ghostRows('id = $1', [rec]))[0].revocation_not_before ?? '';
    const pretend = pretendBusinessToday(w.ctx.app, notBefore);
    await w.claim(taskId, w.worldItAdmin.account).expect(200);
    await w.fail(taskId, { reason: 'không gỡ được' }, w.worldItAdmin.account).expect(200);
    await w.closeFailed(taskId, { reason: 'để sau' }, w.worldItAdmin.account).expect(200);
    expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({
      state: 'RECLAIM_DECIDED',
      revocation_task_id: taskId,
    });

    const again = await reclaim(it2, rec).expect(200);
    pretend.mockRestore();

    const newTask = String(dataOf(again).taskId);
    expect(newTask).not.toBe(taskId);
    expect((await w.timingOf(newTask)).not_before).toBe(notBefore);
    expect(await w.noticesOf('REVOCATION_UPCOMING', seat.employeeId)).toHaveLength(1);
    const first = (await w.revocationOf(newTask)).revocation?.firstReason;
    expect(first).toMatchObject({
      decidedRole: 'DEPARTMENT_HEAD',
      decidedByEmployeeId: dept.headEmployeeId,
      referenceId: rec,
    });
    expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({
      state: 'RECLAIM_DECIDED',
      revocation_task_id: newTask,
    });
    expect(w.codeOf(await reclaim(it2, rec).expect(409))).toBe('GHOST_SEAT.NOT_RECLAIMABLE');
  });

  it('US-10-07 AC-1, AC-2: a completed task ends the G3 ACCEPTED (the seat is gone: the next day it is not recommended again)', async () => {
    const { rec, seat, taskId } = await reclaimed('RT6', 'G3');
    const notBefore = (await w.ghostRows('id = $1', [rec]))[0].revocation_not_before ?? '';
    const pretend = pretendBusinessToday(w.ctx.app, notBefore);
    await w.claim(taskId, w.worldItAdmin.account).expect(200);
    await w.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã gỡ' }, w.worldItAdmin.account).expect(200);
    pretend.mockRestore();

    expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'ACCEPTED' });
    expect(await w.revocationTasksOf(seat.assignmentId)).toEqual([{ id: taskId, status: 'COMPLETED' }]);
  });
});
