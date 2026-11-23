import { OffboardingHarness, type CaseWire, type RightWire } from '../../support/offboarding-harness';
import { K1_CODES, k1Checklist, type K1ChecklistCardWire } from '../../support/k1-checklist';
import type { Department } from '../../support/request-harness';

const h = new OffboardingHarness();

describe('offboarding revocations when seats already hold an open task (integration, real PostgreSQL)', () => {
  let department: Department;
  let k1SubscriptionId: string;
  let k2SubscriptionId: string;
  let counter = 0;
  const code = (prefix = 'E') => `${prefix}-ORE-${(counter += 1)}`;
  const LOCK = { note: 'Đã khóa tài khoản công ty, phiên và token' };

  beforeAll(async () => {
    await h.start();
    department = await h.departmentWithUnit('P-ORE');
    k1SubscriptionId = await h.subscription(60, 'K1');
    k2SubscriptionId = await h.subscription(60, 'K2');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const taskCard = async (taskId: string) =>
    h.dataOf<{ task: { status: string; k1Checklist: K1ChecklistCardWire | null } }>(await h.getTask(taskId).expect(200))
      .task;

  const rightsOf = async (caseId: string) =>
    h.dataOf<{ items: RightWire[] }>(await h.rightsOf(caseId, '?pageSize=100').expect(200)).items;

  it('adds departure reason onto an existing QUEUED K1 RETURN task, switches checklist to DEPARTURE, rejects second call, and completes with MAILBOX_LOCKED', async () => {
    const empCode = code();
    const person = await h.worker(department, empCode);
    const k1Seat = await h.seatOf(person, { subscriptionId: k1SubscriptionId }, empCode);
    const k2Seat = await h.seatOf(person, { subscriptionId: k2SubscriptionId }, empCode);
    const existing = await h.open(k1Seat, 'RETURN');
    const tasksBefore = await h.taskCount();

    const wire = await h.recordedCase(person);
    await h.leaveOnLastDay(wire.id).expect(200);

    // Selecting both named and unnamed when one seat already has QUEUED RETURN task opens K2 and adds DEPARTURE to K1.
    const opened = h.dataOf<CaseWire>(
      await h.revokeRights(wire.id, { assignmentIds: [k1Seat, k2Seat], accountLock: LOCK }).expect(200),
    );
    expect(opened.revocations).toEqual({ created: 1, reasonAdded: 1 });
    expect(await h.taskCount()).toBe(tasksBefore + 1);

    const k1Task = await taskCard(existing.taskId);
    expect(k1Task.k1Checklist?.variant).toBe('DEPARTURE');
    expect(k1Task.k1Checklist?.items.map((item) => item.code)).toEqual([...K1_CODES.DEPARTURE]);

    // Calling a second time for the same case adds nothing and returns 409 NOTHING_TO_REVOKE.
    const second = await h.revokeRights(wire.id, {});
    expect([second.status, h.codeOf(second)]).toEqual([409, 'OFFBOARDING_CASE.NOTHING_TO_REVOKE']);

    // Completing the K2 seat and then K1 seat with DEPARTURE checklist (including RENEWAL_DISABLED and MAILBOX_LOCKED) closes offboarding.
    const k2TaskId = (await rightsOf(wire.id)).find((right) => right.assignmentId === k2Seat)?.revocation?.taskId ?? '';
    await h.claim(k2TaskId).expect(200);
    await h.revoked(k2TaskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa tài khoản K2' }).expect(200);

    await h.claim(existing.taskId).expect(200);
    await h
      .revoked(existing.taskId, {
        completion: 'RENEWAL_CANCELLED',
        paidThroughOn: h.day(30),
        accessState: 'UNTIL_PAID_END',
        k1Checklist: k1Checklist('DEPARTURE', 'đã tắt gia hạn và khóa hộp thư'),
      })
      .expect(200);

    const closed = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));
    expect(closed.mailboxLock).toMatchObject({ recordedBySystem: true });
    expect(closed.blockers).toEqual({});
  });

  it('rolls back inline accountLock when openRevocations adds nothing and throws NOTHING_TO_REVOKE', async () => {
    const empCode = code();
    const person = await h.worker(department, empCode);
    const k1Seat = await h.seatOf(person, { subscriptionId: k1SubscriptionId }, empCode);
    const wire = await h.recordedCase(person);
    await h.leaveOnLastDay(wire.id).expect(200);
    await h.open(k1Seat, 'DEPARTURE', {
      decision: { decidedRole: 'OFFBOARDING_PROCESS', referenceKind: 'OFFBOARDING_CASE', referenceId: wire.id },
    });

    const again = await h.revokeRights(wire.id, { accountLock: LOCK });

    expect([again.status, h.codeOf(again)]).toEqual([409, 'OFFBOARDING_CASE.NOTHING_TO_REVOKE']);
    expect((await h.caseRow(wire.id)).account_lock_at).toBeNull();
  });
});
