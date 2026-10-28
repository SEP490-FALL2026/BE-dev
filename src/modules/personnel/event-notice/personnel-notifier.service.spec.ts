import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { IdentityAccessService } from '../../identity-access/identity-access.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { InAppNotificationInput } from '../../notifications/notifications.types';
import type { OrganizationService } from '../../organization/organization.service';
import { PersonnelNotifier } from './personnel-notifier.service';

const TX = {} as DbTx;
const ORGANIZATION = 'org-1';

interface World {
  heads?: Record<string, string>;
  superAdmin?: string | null;
  itAdminInCharge?: string | null;
  firstUsableItAdmin?: string | null;
}

function notifierOf(world: World = {}) {
  const told: InAppNotificationInput[] = [];
  const held: unknown[] = [];
  const notifications = {
    notifyInApp: jest.fn((_tx: DbTx, input: InAppNotificationInput) => {
      told.push(input);

      return Promise.resolve(true);
    }),
    holdForDepartment: jest.fn((_tx: DbTx, input: unknown) => {
      held.push(input);

      return Promise.resolve(true);
    }),
  } as unknown as NotificationsService;
  const organization = {
    businessToday: () => Promise.resolve('2026-10-28'),
    getDepartmentHeads: (ids: string[]) =>
      Promise.resolve(
        new Map(ids.flatMap((id) => (world.heads?.[id] ? [[id, { employeeId: world.heads[id] }] as const] : []))),
      ),
    getItAdminInCharge: () => Promise.resolve({ departmentId: 'd1', itAdminEmployeeId: world.itAdminInCharge ?? null }),
  } as unknown as OrganizationService;
  const identity = {
    getSuperAdminHolder: () => Promise.resolve(world.superAdmin ? { employeeId: world.superAdmin } : null),
    findFirstUsableItAdminEmployeeId: () => Promise.resolve(world.firstUsableItAdmin ?? null),
  } as unknown as IdentityAccessService;

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
});
