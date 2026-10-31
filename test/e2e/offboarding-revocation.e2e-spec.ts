import request from 'supertest';
import type { DutyWire } from '../support/handover-harness';
import { type CaseWire, OffboardingHarness, type RightWire } from '../support/offboarding-harness';
import type { Department, Person } from '../support/request-harness';

const h = new OffboardingHarness();

/**
 * E2E smoke of D-3: a person who holds two seats leaves. The Super Admin records the departure and then that they left, the IT
 * Admin records the lock of the account and opens the revocation of every right, the head confirms the handover, the IT Admin
 * removes the accounts, and the case is closed with the seats free. Real HTTP and PostgreSQL.
 */
describe('the departure of a person and the revocation of their seats (e2e, D-3)', () => {
  let design: Department;
  let head: Person;
  let leaver: Person;
  let subscriptions: string[];
  let seats: string[];
  let caseId: string;
  const LOCK = { note: 'Company account, sessions and device tokens locked' };

  const rightsOf = async () =>
    h.dataOf<{ items: RightWire[] }>(await h.rightsOf(caseId, '?pageSize=100').expect(200)).items;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    head = await h.worker(design, 'DES-H1');
    await h.makeHead(design, head);
    // Two subscriptions the department owns (a seat sits only on a subscription of its own department, F20).
    subscriptions = [await h.subscription(20, 'K2', design.id), await h.subscription(20, 'K2', design.id)];
    // The person holds a seat of each subscription, as the seat baseline recorded them.
    leaver = await h.worker(design, 'DES-E1');
    seats = [];
    for (const subscriptionId of subscriptions) seats.push(await h.seatOf(leaver, { subscriptionId }, 'DES-E1'));
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  it('the Super Admin records the departure: the person still works, and the head is asked to confirm the handover of each seat', async () => {
    const recorded = await h.recordedCase(leaver);
    caseId = recorded.id;

    expect(recorded).toMatchObject({ state: 'HANDING_OVER', heldRights: 2, lastWorkingDay: h.day(10) });
    const duties = h.dataOf<{ items: DutyWire[] }>(
      await h.duties(`?pageSize=100&employeeId=${leaver.employeeId}`, head.account).expect(200),
    ).items;
    expect(duties.map((duty) => duty.assignmentId).sort()).toEqual([...seats].sort());
    expect(duties.every((duty) => duty.role === 'DEPARTMENT_HEAD' && duty.canConfirm)).toBe(true);
    await request(h.server()).get('/api/v1/me').set(h.as(leaver.account)).expect(200);
  });

  it('the Super Admin records that the person has left: every call of theirs is refused from now on', async () => {
    const left = h.dataOf<CaseWire>(await h.markLeft(caseId).expect(200));

    expect(left).toMatchObject({ state: 'LEFT', left: { leftOn: h.today() }, heldRights: 2 });
    expect(await h.workState(leaver.employeeId)).toBe('TERMINATED/LEFT');
    await request(h.server()).get('/api/v1/me').set(h.as(leaver.account)).expect(401);
  });

  it('the IT Admin records the lock of the account and opens the revocation of every right', async () => {
    const opened = h.dataOf<CaseWire>(
      await h
        .revokeRights(caseId, { count: 2, reason: 'The person left; every right is taken back', accountLock: LOCK })
        .expect(200),
    );

    expect(opened.revocations).toEqual({ created: 2, reasonAdded: 0 });
    expect(opened.checklist).toMatchObject({ accountLock: { state: 'DONE' }, revokeAccess: { state: 'IN_PROGRESS' } });
    const rights = await rightsOf();
    expect(rights.map((right) => right.revocation?.source)).toEqual(['DEPARTURE', 'DEPARTURE']);
  });

  it('the head confirms the handover and the IT Admin removes each account: the seats are given back', async () => {
    const duties = h.dataOf<{ items: DutyWire[] }>(
      await h.duties(`?pageSize=100&employeeId=${leaver.employeeId}`, head.account).expect(200),
    ).items;
    for (const duty of duties) await h.confirmDuty(duty.id, { value: 'HANDED_OVER' }, head.account).expect(201);

    for (const right of await rightsOf()) {
      const taskId = right.revocation?.taskId ?? '';
      await h.claim(taskId).expect(200);
      await h
        .revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Account removed from the admin console' })
        .expect(200);
    }

    for (const seat of seats) expect((await h.assignmentRow(seat)).valid_until).not.toBeNull();
    for (const subscriptionId of subscriptions) expect(await h.freeSeats(subscriptionId)).toBe(20);
    const detail = h.dataOf<CaseWire>(await h.readCase(caseId).expect(200));
    expect(detail).toMatchObject({ heldRights: 0 });
    expect(detail.checklist).toMatchObject({
      dataHandover: { state: 'DONE' },
      revokeAccess: { state: 'DONE' },
      seatsReleased: { state: 'DONE', opened: 2, released: 2 },
    });
  });

  it('the IT Admin closes the case', async () => {
    const closed = h.dataOf<CaseWire>(await h.closeCase(caseId).expect(200));

    expect(closed).toMatchObject({ closed: true, blockers: {} });
    expect(await h.changeKinds(caseId)).toEqual(
      expect.arrayContaining(['RECORDED', 'MARKED_LEFT', 'REVOCATIONS_OPENED', 'CLOSED']),
    );
  });
});
