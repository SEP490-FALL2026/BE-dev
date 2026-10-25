import { OffboardingRevocationService } from '../../src/modules/personnel/offboarding/offboarding-revocation.service';
import { OffboardingHarness, type CaseWire } from '../support/offboarding-harness';
import type { Department, Person } from '../support/request-harness';

const h = new OffboardingHarness();

/** US-03-04 AC-29, SoD-5, QĐ-77m: an IT Admin who records, moves, cancels or revokes for themselves, over HTTP, on real PostgreSQL. */
describe('an IT Admin who leaves records their own departure (integration, real PostgreSQL)', () => {
  let des: Department;
  let a1: Person;
  let subscription: string;
  let seat: string;

  const setAccount = (status: 'ACTIVE' | 'LOCKED') =>
    h.ctx.sql.query(`UPDATE app_users SET status = $2::"AppUserStatus" WHERE id = $1`, [h.it1.appUserId, status]);

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

  it('is allowed while they are the only IT Admin who can act, and is flagged for the Super Admin each time', async () => {
    await setAccount('LOCKED');
    try {
      const wire = await h.recordedCase(a1, {}, a1.account);
      expect(wire.selfExecuted).toBe(true);
      expect((await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).length).toBe(1);

      await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Dời ngày' }, a1.account).expect(200);
      expect((await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).length).toBe(2);

      const cancelled = h.dataOf<CaseWire>(await h.cancelCase(wire.id, { reason: 'Ở lại' }, a1.account).expect(200));
      expect(cancelled.state).toBe('CANCELLED');
      expect((await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).length).toBe(3);
    } finally {
      await setAccount('ACTIVE');
    }
  });

  it('is refused while another IT Admin can act, and accepted from the other one, without a flag', async () => {
    const own = await h.recordCase(h.body(a1), a1.account);
    expect([own.status, h.codeOf(own)]).toEqual([409, 'OFFBOARDING_CASE.SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN']);
    expect(await h.caseCount(a1.employeeId)).toBe(1);

    const wire = await h.recordedCase(a1);
    expect(wire.selfExecuted).toBe(false);
    const change = await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Dời' }, a1.account);
    const cancel = await h.cancelCase(wire.id, { reason: 'Ở lại' }, a1.account);
    expect([change, cancel].map((response) => [response.status, h.codeOf(response)])).toEqual([
      [409, 'OFFBOARDING_CASE.SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN'],
      [409, 'OFFBOARDING_CASE.SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN'],
    ]);
    expect(await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).toEqual([]);
    await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Dời' }).expect(200);
    expect(await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).toEqual([]);

    // The person has left, so the account of a1 no longer acts: the command is the one of the service, called as them.
    await h.markLeft(wire.id).expect(200);
    const revocations = h.ctx.app.get(OffboardingRevocationService);
    const asSelf = await revocations
      .openRevocations(h.actorOf(a1.account), wire.id, {
        count: 1,
        reason: 'Tự thu hồi',
        accountLock: { note: 'khóa' },
      })
      .catch((error: { code?: string }) => error);
    expect(asSelf).toMatchObject({ code: 'SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN' });
    expect(
      await h
        .rightsOf(wire.id)
        .expect(200)
        .then((response) => h.dataOf<{ items: unknown[] }>(response).items),
    ).toHaveLength(1);
    const byOther = h.dataOf<CaseWire>(
      await h.revokeRights(wire.id, { count: 1, reason: 'Thu hồi', accountLock: { note: 'khóa' } }).expect(200),
    );
    expect(byOther.revocations?.created).toBe(1);
    expect(await h.dutyRows(seat)).toHaveLength(2);
  });
});
