import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { InAppNotificationInput } from '../../notifications/public/notifications.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelNotifier } from './personnel-notifier.service';

const TX = {} as DbTx;
const ORGANIZATION = 'org-1';

interface World {
  heads?: Record<string, string>;
  superAdmin?: string | null;
  itAdminInCharge?: string | null;
  firstUsableItAdmin?: string | null;
  /** The IT Admin named for the department itself (what a departure is told through), and the IT Admins whose account can act. */
  itAdminOfDepartment?: string | null;
  usableItAdmins?: string[];
  /** Every notice already exists for its recipient and event key: `notifyInApp` writes nothing. */
  alreadyTold?: boolean;
}

function notifierOf(world: World = {}) {
  const told: InAppNotificationInput[] = [];
  const held: unknown[] = [];
  const notifications = {
    notifyInApp: jest.fn((_tx: DbTx, input: InAppNotificationInput) => {
      told.push(input);

      return Promise.resolve(!world.alreadyTold);
    }),
    holdForDepartment: jest.fn((_tx: DbTx, input: unknown) => {
      held.push(input);

      return Promise.resolve(true);
    }),
  } as unknown as NotificationsApi;
  const organization = {
    businessToday: () => Promise.resolve('2026-10-28'),
    getDepartmentHeads: (ids: string[]) =>
      Promise.resolve(
        new Map(ids.flatMap((id) => (world.heads?.[id] ? [[id, { employeeId: world.heads[id] }] as const] : []))),
      ),
    getItAdminInCharge: () => Promise.resolve({ departmentId: 'd1', itAdminEmployeeId: world.itAdminInCharge ?? null }),
    getItAdminInChargeOfDepartment: () => Promise.resolve(world.itAdminOfDepartment ?? null),
  } as unknown as OrganizationReadApi;
  const identity = {
    getSuperAdminHolder: () => Promise.resolve(world.superAdmin ? { employeeId: world.superAdmin } : null),
    findFirstUsableItAdminEmployeeId: () => Promise.resolve(world.firstUsableItAdmin ?? null),
    findAllUsableItAdminEmployeeIds: () => Promise.resolve(world.usableItAdmins ?? []),
  } as unknown as IdentityAccessApi;

  return { notifier: new PersonnelNotifier(notifications, organization, identity), told, held };
}

const recipients = (told: InAppNotificationInput[], code: string) =>
  told
    .filter((notice) => notice.code === code)
    .map((notice) => notice.recipientEmployeeId)
    .sort();

describe('who is told of an event of the personnel context (F17, spec B)', () => {
  it('tells the person and the heads of the departments concerned once each, with ids and days only', async () => {
    const { notifier, told } = notifierOf({ heads: { from: 'head-from', to: 'head-to' } });

    await notifier.eventRecorded(TX, {
      organizationId: ORGANIZATION,
      employeeId: 'person',
      departmentId: 'to',
      alsoDepartmentIds: ['from'],
      eventKind: 'TRANSFER_RECORDED',
      eventId: 'transfer-1',
      subjectType: 'DEPARTMENT_TRANSFER',
      effectiveOn: '2026-11-03',
    });

    expect(recipients(told, 'PERSONNEL_EVENT_RECORDED')).toEqual(['head-from', 'head-to', 'person']);
    expect(told[0]).toMatchObject({
      organizationId: ORGANIZATION,
      subject: { type: 'DEPARTMENT_TRANSFER', id: 'transfer-1' },
      params: { employeeId: 'person', departmentId: 'to', eventKind: 'TRANSFER_RECORDED', effectiveOn: '2026-11-03' },
    });
    expect(Object.keys(told[0].params).sort()).toEqual(['departmentId', 'effectiveOn', 'employeeId', 'eventKind']);
  });

  it('tells a person who is also the head of their department once, and a department with no head nobody', async () => {
    const { notifier, told } = notifierOf({ heads: { d1: 'person' } });

    await notifier.eventRecorded(TX, {
      organizationId: ORGANIZATION,
      employeeId: 'person',
      departmentId: 'd1',
      alsoDepartmentIds: ['d-without-head'],
      eventKind: 'LONG_LEAVE_STARTED',
      eventId: 'leave-1',
      subjectType: 'EMPLOYEE_LEAVE',
      effectiveOn: '2026-10-01',
    });

    expect(recipients(told, 'PERSONNEL_EVENT_RECORDED')).toEqual(['person']);
  });

  it('tells the Super Admin of a notice that arrived and of one that is late, once each, with ids and the kind', async () => {
    const { notifier, told } = notifierOf({ superAdmin: 'sa' });
    const notice = {
      organizationId: ORGANIZATION,
      employeeId: 'person',
      departmentId: 'd1',
      noticeId: 'n1',
      kind: 'DEPARTURE',
    };

    await notifier.noticeReceived(TX, notice);
    await notifier.noticeOverdue(TX, notice);

    expect(told.map((item) => [item.code, item.recipientEmployeeId, item.eventKey])).toEqual([
      ['PERSONNEL_NOTICE_RECEIVED', 'sa', 'PERSONNEL_NOTICE_RECEIVED:n1'],
      ['PERSONNEL_NOTICE_OVERDUE', 'sa', 'PERSONNEL_NOTICE_OVERDUE:n1'],
    ]);
    expect(told[0].params).toEqual({
      noticeId: 'n1',
      employeeId: 'person',
      departmentId: 'd1',
      eventKind: 'DEPARTURE',
    });
  });

  it('tells nobody when nobody holds the Super Admin role, instead of failing the event', async () => {
    const { notifier, told } = notifierOf({ superAdmin: null });

    await notifier.noticeReceived(TX, {
      organizationId: ORGANIZATION,
      employeeId: 'p',
      departmentId: 'd',
      noticeId: 'n',
      kind: 'DEPARTURE',
    });

    expect(told).toEqual([]);
  });

  it('tells both the Super Admin and the IT Admin in charge of an abrupt departure, and the first usable IT Admin when nobody is in charge', async () => {
    const inCharge = notifierOf({ superAdmin: 'sa', itAdminInCharge: 'it-in-charge' });
    const nobody = notifierOf({ superAdmin: 'sa', itAdminInCharge: null, firstUsableItAdmin: 'it-first' });
    const facts = {
      organizationId: ORGANIZATION,
      employeeId: 'p',
      departmentId: 'd1',
      caseId: 'c1',
      effectiveOn: '2026-10-29',
      lastDayInOffice: '2026-10-28',
    };

    await inCharge.notifier.abruptDeparture(TX, facts);
    await nobody.notifier.abruptDeparture(TX, facts);

    expect(recipients(inCharge.told, 'ABRUPT_DEPARTURE_RECORDED')).toEqual(['it-in-charge', 'sa']);
    expect(recipients(nobody.told, 'ABRUPT_DEPARTURE_RECORDED')).toEqual(['it-first', 'sa']);
  });

  it('tells the Super Admin of each role a person who leaves holds, once for each role and stage', async () => {
    const { notifier, told } = notifierOf({ superAdmin: 'sa' });
    const facts = {
      organizationId: ORGANIZATION,
      employeeId: 'p',
      departmentId: 'd1',
      caseId: 'c1',
      effectiveOn: '2026-11-30',
      stage: 'RECORDED',
    };

    await notifier.roleHolderLeaving(TX, { ...facts, roleFlag: 'SUPER_ADMIN_HOLDER' });
    await notifier.roleHolderLeaving(TX, { ...facts, roleFlag: 'FINANCE' });

    expect(told.map((item) => item.params.roleFlag)).toEqual(['SUPER_ADMIN_HOLDER', 'FINANCE']);
    expect(told.map((item) => item.eventKey)).toEqual([
      'ROLE_HOLDER_LEAVING:c1:SUPER_ADMIN_HOLDER:RECORDED',
      'ROLE_HOLDER_LEAVING:c1:FINANCE:RECORDED',
    ]);
  });

  it('tells the head of the department the deadline of the review, a late review again with its own key, and keeps it for a department with no head', async () => {
    const { notifier, told, held } = notifierOf();
    const review = {
      organizationId: ORGANIZATION,
      employeeId: 'p',
      departmentId: 'd1',
      reviewId: 'r1',
      dueOn: '2026-11-04',
    };

    await notifier.reviewDue(TX, { ...review, headEmployeeId: 'head' });
    await notifier.reviewDue(TX, { ...review, headEmployeeId: 'head', reminder: true });
    await notifier.reviewDue(TX, { ...review, headEmployeeId: null });

    expect(told.map((item) => [item.recipientEmployeeId, item.eventKey])).toEqual([
      ['head', 'TRANSFER_REVIEW_DUE:r1'],
      ['head', 'TRANSFER_REVIEW_DUE:r1:overdue'],
    ]);
    expect(told[0].params).toEqual({ employeeId: 'p', departmentId: 'd1', dueOn: '2026-11-04' });
    expect(held).toEqual([expect.objectContaining({ departmentId: 'd1', code: 'TRANSFER_REVIEW_DUE' })]);
  });

  describe('the rights of a departure still not taken away past the day (QĐ-110c)', () => {
    const facts = {
      organizationId: ORGANIZATION,
      employeeId: 'leaver',
      departmentId: 'd1',
      caseId: 'c1',
      dueOn: '2026-10-01',
      rightCount: 2,
      today: '2026-10-02',
    };

    it('tells the IT Admin in charge of the department and the Super Admin, with ids, the day and the count only, once for the case and the day', async () => {
      const { notifier, told } = notifierOf({ superAdmin: 'sa', itAdminOfDepartment: 'it-in-charge' });

      const written = await notifier.revocationOverdue(TX, facts);

      expect(written).toBe(true);
      expect(recipients(told, 'REVOCATION_OVERDUE')).toEqual(['it-in-charge', 'sa']);
      expect(told[0]).toMatchObject({
        subject: { type: 'OFFBOARDING_CASE', id: 'c1' },
        params: { caseId: 'c1', employeeId: 'leaver', dueOn: '2026-10-01', rightCount: 2 },
        eventKey: 'offboarding:c1:2026-10-02',
      });
      expect(Object.keys(told[0].params).sort()).toEqual(['caseId', 'dueOn', 'employeeId', 'rightCount']);
    });

    it('says nothing was written when every notice of the day already exists', async () => {
      const { notifier } = notifierOf({ superAdmin: 'sa', itAdminOfDepartment: 'it', alreadyTold: true });

      expect(await notifier.revocationOverdue(TX, facts)).toBe(false);
    });

    it('does not tell the person who left as the IT Admin: another IT Admin who can act is told, and the Super Admin', async () => {
      const { notifier, told } = notifierOf({
        superAdmin: 'sa',
        itAdminOfDepartment: 'leaver',
        usableItAdmins: ['leaver', 'it-other'],
      });

      await notifier.revocationOverdue(TX, facts);

      expect(recipients(told, 'REVOCATION_OVERDUE')).toEqual(['it-other', 'sa']);
    });

    it('tells the first IT Admin who can act when the department names none, and only the Super Admin when there is none', async () => {
      const named = notifierOf({ superAdmin: 'sa', itAdminOfDepartment: null, usableItAdmins: ['it-a', 'it-b'] });
      const none = notifierOf({ superAdmin: 'sa', itAdminOfDepartment: null, usableItAdmins: [] });

      await named.notifier.revocationOverdue(TX, facts);
      await none.notifier.revocationOverdue(TX, facts);

      expect(recipients(named.told, 'REVOCATION_OVERDUE')).toEqual(['it-a', 'sa']);
      expect(recipients(none.told, 'REVOCATION_OVERDUE')).toEqual(['sa']);
    });

    it('tells a person who is both the IT Admin in charge and the Super Admin once, and a case without a department through the first IT Admin', async () => {
      const both = notifierOf({ superAdmin: 'sa', itAdminOfDepartment: 'sa' });
      const unplaced = notifierOf({ superAdmin: 'sa', usableItAdmins: ['it-a'] });

      await both.notifier.revocationOverdue(TX, facts);
      await unplaced.notifier.revocationOverdue(TX, { ...facts, departmentId: null });

      expect(recipients(both.told, 'REVOCATION_OVERDUE')).toEqual(['sa']);
      expect(recipients(unplaced.told, 'REVOCATION_OVERDUE')).toEqual(['it-a', 'sa']);
    });
  });
  describe('the block moment of a departure (QĐ-110b, QĐ-110d, R-1)', () => {
    const facts = {
      organizationId: ORGANIZATION,
      employeeId: 'leaver',
      departmentId: 'd1',
      caseId: 'c1',
      blockedOn: '2026-10-01',
      revocationDueOn: '2026-10-02',
      markLeft: true,
      accountLocked: false,
    };
    const audiences = (told: InAppNotificationInput[]) =>
      told.map((notice) => [notice.recipientEmployeeId, notice.params.audience, notice.eventKey]);

    it('tells the Super Admin to mark the person as left and the IT Admin to block the company account and open the revocation, once each, with ids and days only', async () => {
      const { notifier, told } = notifierOf({ superAdmin: 'sa', itAdminOfDepartment: 'it1' });

      await notifier.departureAccessBlocked(TX, facts);

      expect(audiences(told)).toEqual([
        ['sa', 'SUPER_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:SUPER_ADMIN'],
        ['it1', 'IT_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:IT_ADMIN'],
      ]);
      expect(told[0]).toMatchObject({
        code: 'DEPARTURE_ACCESS_BLOCKED',
        subject: { type: 'OFFBOARDING_CASE', id: 'c1' },
        params: {
          caseId: 'c1',
          employeeId: 'leaver',
          departmentId: 'd1',
          blockedOn: '2026-10-01',
          revocationDueOn: '2026-10-02',
        },
      });
      expect(Object.keys(told[0].params).sort()).toEqual([
        'audience',
        'blockedOn',
        'caseId',
        'departmentId',
        'employeeId',
        'revocationDueOn',
      ]);
    });

    it('does not ask the Super Admin to mark a person who is already marked as left, and tells the IT Admin who can act when the department names none', async () => {
      const { notifier, told } = notifierOf({ superAdmin: 'sa', usableItAdmins: ['it-a'] });

      await notifier.departureAccessBlocked(TX, { ...facts, markLeft: false });

      expect(audiences(told)).toEqual([['it-a', 'IT_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:IT_ADMIN']]);
    });

    it('tells only the Super Admin when no IT Admin can act, and never the person who left', async () => {
      const { notifier, told } = notifierOf({
        superAdmin: 'sa',
        itAdminOfDepartment: 'leaver',
        usableItAdmins: ['leaver'],
      });

      await notifier.departureAccessBlocked(TX, facts);

      expect(audiences(told)).toEqual([['sa', 'SUPER_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:SUPER_ADMIN']]);
    });
  });

  describe('the lock of the company account that was not written by the end of the day (QĐ-94m, R-1)', () => {
    const facts = {
      organizationId: ORGANIZATION,
      employeeId: 'leaver',
      departmentId: 'd1',
      caseId: 'c1',
      blockedOn: '2026-11-12',
    };

    it('tells the IT Admin and the Super Admin once for the case, and says whether anything was written', async () => {
      const first = notifierOf({ superAdmin: 'sa', itAdminOfDepartment: 'it1' });
      const again = notifierOf({ superAdmin: 'sa', itAdminOfDepartment: 'it1', alreadyTold: true });

      expect(await first.notifier.accountLockOverdue(TX, facts)).toBe(true);
      expect(await again.notifier.accountLockOverdue(TX, facts)).toBe(false);

      expect(recipients(first.told, 'ACCOUNT_LOCK_OVERDUE')).toEqual(['it1', 'sa']);
      expect(first.told[0]).toMatchObject({
        subject: { type: 'OFFBOARDING_CASE', id: 'c1' },
        params: { caseId: 'c1', employeeId: 'leaver', blockedOn: '2026-11-12' },
        eventKey: 'ACCOUNT_LOCK_OVERDUE:c1',
      });
      expect(Object.keys(first.told[0].params).sort()).toEqual(['blockedOn', 'caseId', 'employeeId']);
    });
  });

  describe('the IT Admin who answers for the department is told when a departure is recorded, moved or cancelled (SPEC MF2-E)', () => {
    const departure = (
      eventKind: 'DEPARTURE_RECORDED' | 'DEPARTURE_LAST_DAY_CHANGED' | 'DEPARTURE_CANCELLED' | 'DEPARTURE_MARKED_LEFT',
    ) => ({
      organizationId: ORGANIZATION,
      employeeId: 'leaver',
      departmentId: 'd1',
      eventKind,
      eventId: 'c1',
      subjectType: 'OFFBOARDING_CASE',
      effectiveOn: '2026-10-30',
    });

    it.each(['DEPARTURE_RECORDED', 'DEPARTURE_LAST_DAY_CHANGED', 'DEPARTURE_CANCELLED'] as const)(
      'adds the IT Admin in charge to the person and the head for %s',
      async (kind) => {
        const { notifier, told } = notifierOf({ heads: { d1: 'head' }, itAdminOfDepartment: 'it1' });

        await notifier.eventRecorded(TX, departure(kind));

        expect(recipients(told, 'PERSONNEL_EVENT_RECORDED')).toEqual(['head', 'it1', 'leaver']);
      },
    );

    it('does not add them for the departure marked as left, nor for a transfer or a leave', async () => {
      const { notifier, told } = notifierOf({ heads: { d1: 'head' }, itAdminOfDepartment: 'it1' });

      await notifier.eventRecorded(TX, departure('DEPARTURE_MARKED_LEFT'));
      await notifier.eventRecorded(TX, { ...departure('DEPARTURE_RECORDED'), eventKind: 'TRANSFER_RECORDED' });

      expect(recipients(told, 'PERSONNEL_EVENT_RECORDED')).toEqual(['head', 'head', 'leaver', 'leaver']);
    });
  });
});
