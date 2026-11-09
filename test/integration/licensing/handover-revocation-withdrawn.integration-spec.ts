import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import type { RevocationSource } from '../../../src/modules/licensing/public/licensing.types';
import { HandoverHarness } from '../../support/handover-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new HandoverHarness();

/** DA6-28, BR-MF5-04: the duty of the handover follows the reasons of a revocation that stand (integration, real PostgreSQL). */
describe('the handover duty when a reason of a revocation is taken back (integration, real PostgreSQL)', () => {
  let des: Department;
  let head: Person;
  let lossy: string;
  let counter = 0;
  const NOTE = 'Sao lưu trước khi gỡ';
  const ref = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-WDH');
    head = await h.veteran(des, 'H1-WDH');
    await h.makeHead(des, head);
    lossy = await h.subscription(40, 'K2');
    await h.describePlan(lossy, true, NOTE);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const withdraw = (assignmentId: string, source: RevocationSource, referenceId: string | null) =>
    h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(LicensingApi).withdrawRevocationReason(tx, h.actorOf(h.it1), {
        assignmentId,
        source,
        referenceId,
        cause: 'NO_LONGER_APPLIES',
      }),
    );
  const seat = async () => {
    const code = `E-WDH-${(counter += 1)}`;
    const person = await h.veteran(des, code);

    return h.seatOf(person, { subscriptionId: lossy }, code);
  };
  const byHead = (referenceKind: string, referenceId: string) => ({
    decidedByEmployeeId: head.employeeId,
    referenceKind,
    referenceId,
  });

  it('DA6-28: the duty of the head who decided goes with his reason, and the reason that stays owes the IT Admin (QĐ-63a)', async () => {
    const assignmentId = await seat();
    const referenceId = ref(1);
    await h.open(assignmentId, 'GHOST_SEAT', {
      decision: byHead('REVIEW', referenceId),
    });
    await h.open(assignmentId, 'TIME_LIMITED_EXPIRY');
    expect((await h.dutyRows(assignmentId)).map((duty) => [duty.confirmer_role, duty.cancelled_at === null])).toEqual([
      ['DEPARTMENT_HEAD', true],
    ]);

    expect(await withdraw(assignmentId, 'GHOST_SEAT', referenceId)).toMatchObject({ outcome: 'CONTINUES' });

    const duties = await h.dutyRows(assignmentId);
    expect(duties).toHaveLength(2);
    expect(duties[0]).toMatchObject({ confirmer_role: 'DEPARTMENT_HEAD', cancel_reason: 'NO_LONGER_APPLIES' });
    expect(duties[0].cancelled_at).not.toBeNull();
    expect(duties[1]).toMatchObject({ confirmer_role: 'IT_ADMIN', cancelled_at: null, source: 'TIME_LIMITED_EXPIRY' });
  });

  it('DA6-28: the duty is kept when the reason that stays asks the same of the same person', async () => {
    const assignmentId = await seat();
    const referenceId = ref(2);
    await h.open(assignmentId, 'GHOST_SEAT', {
      decision: byHead('REVIEW', referenceId),
    });
    await h.open(assignmentId, 'MANAGER_NOT_NEEDED', {
      decision: byHead('REQUEST', ref(3)),
    });

    await withdraw(assignmentId, 'GHOST_SEAT', referenceId);

    const duties = await h.dutyRows(assignmentId);
    expect(duties).toHaveLength(1);
    expect(duties[0]).toMatchObject({ confirmer_role: 'DEPARTMENT_HEAD', cancelled_at: null });
  });

  it('DA6-28: a task cancelled because its only reason was taken back leaves no duty waiting, and the return listener does not fail', async () => {
    const assignmentId = await seat();
    const referenceId = ref(4);
    await h.open(assignmentId, 'GHOST_SEAT', {
      decision: byHead('REVIEW', referenceId),
    });
    expect((await h.dutyRows(assignmentId)).filter((duty) => duty.cancelled_at === null)).toHaveLength(1);

    expect(await withdraw(assignmentId, 'GHOST_SEAT', referenceId)).toMatchObject({ outcome: 'CANCELLED' });

    const duties = await h.dutyRows(assignmentId);
    expect(duties).toHaveLength(1);
    expect(duties[0]).toMatchObject({ cancel_reason: 'NO_LONGER_APPLIES' });
    expect(await h.liveTaskOf(assignmentId)).toBeNull();
  });
});
