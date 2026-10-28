import { OffboardingHarness, type CaseWire } from '../support/offboarding-harness';
import type { Department, Person } from '../support/request-harness';

const h = new OffboardingHarness();

/**
 * US-03-04 AC-29 as it stands after `QĐ-87a` (F40, F45, F19): the Super Admin writes the events of a departure, never about
 * themselves; the IT Admin takes only the technical steps and has no flag of "done on oneself" any more. Over HTTP, on real PostgreSQL.
 */
describe('who writes the departure of a person, and the one about an IT Admin (integration, real PostgreSQL)', () => {
  let des: Department;
  let a1: Person;
  let subscription: string;
  let seat: string;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-IT');
    a1 = await h.worker(des, 'A1-OS', ['IT_ADMIN']);
    subscription = await h.subscription(40, 'K2');
    seat = await h.seatOf(a1, { subscriptionId: subscription }, 'A1-OS');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('is recorded, moved and cancelled by the Super Admin about an IT Admin, with no flag of "done on oneself" and no trace for it', async () => {
    const wire = await h.recordedCase(a1);
    expect(Object.keys(wire)).not.toContain('selfExecuted');
    expect(wire).toMatchObject({ recordedByAppUserId: h.sa.appUserId, recordedByProcedure: false });

    await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Dời ngày' }).expect(200);
    const cancelled = h.dataOf<CaseWire>(await h.cancelCase(wire.id, { reason: 'Ở lại' }).expect(200));

    expect(cancelled.state).toBe('CANCELLED');
    expect(await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).toEqual([]);
  });

  it('refuses the IT Admin on every write of the events (403), and the Super Admin about themselves (403), and writes nothing', async () => {
    const wire = await h.recordedCase(a1);
    const before = await h.caseCount(a1.employeeId);

    const byItAdmin = [
      await h.recordCase(h.body(a1), h.it1),
      await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Dời' }, h.it1),
      await h.cancelCase(wire.id, { reason: 'Ở lại' }, h.it1),
      await h.markLeft(wire.id, {}, h.it1),
    ];
    const aboutSelf = await h.recordCase({ ...h.body(a1), employeeId: h.sa.employeeId });

    expect(byItAdmin.map((response) => [response.status, h.codeOf(response)])).toEqual(
      Array(4).fill([403, 'AUTHORIZATION.FORBIDDEN']),
    );
    expect([aboutSelf.status, h.codeOf(aboutSelf)]).toEqual([403, 'PERSONNEL.SELF_CHANGE_FORBIDDEN']);
    expect(await h.caseCount(a1.employeeId)).toBe(before);
    expect(await h.caseCount(h.sa.employeeId)).toBe(0);
    await h.cancelCase(wire.id, { reason: 'Ở lại' }).expect(200);
  });

  it('leaves the technical steps to the IT Admin: the lock of the account and the revocations go through after the Super Admin marks the person left', async () => {
    const wire = await h.recordedCase(a1);
    await h.markLeft(wire.id).expect(200);

    const bySuperAdmin = await h.revokeRights(
      wire.id,
      { count: 1, reason: 'Thu hồi', accountLock: { note: 'khóa' } },
      h.sa,
    );
    expect([bySuperAdmin.status, h.codeOf(bySuperAdmin)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
    expect(
      await h
        .rightsOf(wire.id, '', h.it1)
        .expect(200)
        .then((response) => h.dataOf<{ items: unknown[] }>(response).items),
    ).toHaveLength(1);
    const byItAdmin = h.dataOf<CaseWire>(
      await h.revokeRights(wire.id, { count: 1, reason: 'Thu hồi', accountLock: { note: 'khóa' } }).expect(200),
    );

    expect(byItAdmin.revocations?.created).toBe(1);
    // One duty for each departure recorded on the seat in this suite: the two cancelled by the tests above, and the one of this case.
    const duties = await h.dutyRows(seat);
    expect(duties).toHaveLength(3);
    expect(duties.filter((duty) => duty.cancelled_at === null)).toHaveLength(1);
  });
});
