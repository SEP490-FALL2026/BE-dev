import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { InAppNotificationInput } from '../../notifications/public/notifications.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelNotifier } from './personnel-notifier.service';

const TX = {} as DbTx;
const ORGANIZATION = 'org-1';

interface ActingSpec {
  inCharge?: string | null;
  substitute?: string | null;
  usable?: string[];
}

interface World {
  heads?: Record<string, string>;
  superAdmin?: string | null;
  usableSuperAdmin?: string | null;
  actingByDept?: Record<string, ActingSpec>;
  workDepartments?: Record<string, string>;
  alreadyTold?: boolean;
}

function notifierOf(world: World = {}) {
  const told: InAppNotificationInput[] = [];
  const notifications = {
    notifyInApp: jest.fn((_tx: DbTx, input: InAppNotificationInput) => {
      told.push(input);

      return Promise.resolve(!world.alreadyTold);
    }),
  } as unknown as NotificationsApi;
  const itAdminsActingFor = jest.fn(
    async (deptIds: readonly string[], usableAmong: (ids: string[]) => Promise<Set<string>>) => {
      const entries = await Promise.all(
        deptIds.map(async (deptId) => {
          const spec = world.actingByDept?.[deptId];
          if (!spec) {
            return [
              deptId,
              {
                inCharge: null as string | null,
                substitute: null as string | null,
                defaultAssignee: null as string | null,
                actors: [] as string[],
              },
            ] as const;
          }
          const candidates = [spec.inCharge, spec.substitute].filter((id): id is string => Boolean(id));
          const usable = candidates.length === 0 ? new Set<string>() : await usableAmong(candidates);
          const inCharge = spec.inCharge && usable.has(spec.inCharge) ? spec.inCharge : null;
          const substitute = spec.substitute && usable.has(spec.substitute) ? spec.substitute : null;
          const actors = [inCharge, substitute].filter((id): id is string => id !== null);
          return [deptId, { inCharge, substitute, defaultAssignee: substitute ?? inCharge, actors }] as const;
        }),
      );
      return new Map(entries);
    },
  );
  const organization = {
    businessToday: () => Promise.resolve('2026-10-28'),
    getDepartmentHeads: (ids: string[]) =>
      Promise.resolve(
        new Map(ids.flatMap((id) => (world.heads?.[id] ? [[id, { employeeId: world.heads[id] }] as const] : []))),
      ),
    workDepartmentsOf: jest.fn((ids: readonly string[]) =>
      Promise.resolve(
        new Map(ids.flatMap((id) => (world.workDepartments?.[id] ? [[id, world.workDepartments[id]] as const] : []))),
      ),
    ),
    itAdminsActingFor,
  } as unknown as OrganizationReadApi;
  const usableAcrossDepts = new Set(Object.values(world.actingByDept ?? {}).flatMap((s) => s.usable ?? []));
  const findFirstUsableItAdminEmployeeId = jest.fn();
  const findAllUsableItAdminEmployeeIds = jest.fn();
  const identity = {
    getSuperAdminHolder: () => Promise.resolve(world.superAdmin ? { employeeId: world.superAdmin } : null),
    findUsableSuperAdminEmployeeId: jest
      .fn()
      .mockResolvedValue(world.usableSuperAdmin !== undefined ? world.usableSuperAdmin : (world.superAdmin ?? null)),
    findUsableItAdminEmployeeIds: jest.fn((ids: readonly string[]) =>
      Promise.resolve(new Set(ids.filter((id) => usableAcrossDepts.has(id)))),
    ),
    findFirstUsableItAdminEmployeeId,
    findAllUsableItAdminEmployeeIds,
  } as unknown as IdentityAccessApi;

  return {
    notifier: new PersonnelNotifier(notifications, organization, identity),
    told,
    findFirstUsableItAdminEmployeeId,
    findAllUsableItAdminEmployeeIds,
  };
}

const recipients = (told: InAppNotificationInput[], code: string) =>
  told
    .filter((notice) => notice.code === code)
    .map((notice) => notice.recipientEmployeeId)
    .sort();

describe('who is told of an event of the personnel context', () => {
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

  it('tells Super Admin and acting IT Admins (in-charge + substitute) on abrupt departure without calling findFirstUsableItAdminEmployeeId', async () => {
    const acting = notifierOf({
      superAdmin: 'sa',
      actingByDept: { d1: { inCharge: 'it-in-charge', substitute: 'it-sub', usable: ['it-in-charge', 'it-sub'] } },
    });
    const nobody = notifierOf({ superAdmin: 'sa', actingByDept: {} });
    const facts = {
      organizationId: ORGANIZATION,
      employeeId: 'p',
      departmentId: 'd1',
      caseId: 'c1',
      effectiveOn: '2026-10-29',
      lastDayInOffice: '2026-10-28',
    };

    await acting.notifier.abruptDeparture(TX, facts);
    await nobody.notifier.abruptDeparture(TX, facts);

    expect(recipients(acting.told, 'ABRUPT_DEPARTURE_RECORDED')).toEqual(['it-in-charge', 'it-sub', 'sa']);
    expect(recipients(nobody.told, 'ABRUPT_DEPARTURE_RECORDED')).toEqual(['sa']);
    expect(nobody.findFirstUsableItAdminEmployeeId).not.toHaveBeenCalled();
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
  });

  describe('revocation overdue notices', () => {
    const facts = {
      organizationId: ORGANIZATION,
      employeeId: 'leaver',
      departmentId: 'd1',
      caseId: 'c1',
      dueOn: '2026-10-01',
      rightCount: 2,
      today: '2026-10-02',
    };

    it('tells the acting IT Admins of the department and the Super Admin once for the case and the day', async () => {
      const { notifier, told } = notifierOf({
        superAdmin: 'sa',
        actingByDept: { d1: { inCharge: 'it-in-charge', usable: ['it-in-charge'] } },
      });

      const written = await notifier.revocationOverdue(TX, facts);

      expect(written).toBe(true);
      expect(recipients(told, 'REVOCATION_OVERDUE')).toEqual(['it-in-charge', 'sa']);
      expect(told[0]).toMatchObject({
        subject: { type: 'OFFBOARDING_CASE', id: 'c1' },
        params: { caseId: 'c1', employeeId: 'leaver', dueOn: '2026-10-01', rightCount: 2 },
        eventKey: 'offboarding:c1:2026-10-02',
      });
    });

    it('says nothing was written when every notice of the day already exists', async () => {
      const { notifier } = notifierOf({
        superAdmin: 'sa',
        actingByDept: { d1: { inCharge: 'it', usable: ['it'] } },
        alreadyTold: true,
      });

      expect(await notifier.revocationOverdue(TX, facts)).toBe(false);
    });

    it('excludes the leaver and tells the active substitute and the Super Admin', async () => {
      const { notifier, told } = notifierOf({
        superAdmin: 'sa',
        actingByDept: { d1: { inCharge: 'leaver', substitute: 'it-sub', usable: ['leaver', 'it-sub'] } },
      });

      await notifier.revocationOverdue(TX, facts);

      expect(recipients(told, 'REVOCATION_OVERDUE')).toEqual(['it-sub', 'sa']);
    });

    it('tells only the Super Admin when no acting IT Admin exists and never broadcasts to other IT Admins', async () => {
      const none = notifierOf({ superAdmin: 'sa', actingByDept: {} });

      await none.notifier.revocationOverdue(TX, facts);

      expect(recipients(none.told, 'REVOCATION_OVERDUE')).toEqual(['sa']);
      expect(none.findAllUsableItAdminEmployeeIds).not.toHaveBeenCalled();
    });

    it('tells a person who is both acting IT Admin and Super Admin once, and an unplaced case only the Super Admin', async () => {
      const both = notifierOf({ superAdmin: 'sa', actingByDept: { d1: { inCharge: 'sa', usable: ['sa'] } } });
      const unplaced = notifierOf({ superAdmin: 'sa', actingByDept: {} });

      await both.notifier.revocationOverdue(TX, facts);
      await unplaced.notifier.revocationOverdue(TX, { ...facts, departmentId: null });

      expect(recipients(both.told, 'REVOCATION_OVERDUE')).toEqual(['sa']);
      expect(recipients(unplaced.told, 'REVOCATION_OVERDUE')).toEqual(['sa']);
    });
  });

  describe('account lock overdue notices', () => {
    const facts = {
      organizationId: ORGANIZATION,
      employeeId: 'leaver',
      departmentId: 'd1',
      caseId: 'c1',
      blockedOn: '2026-11-12',
    };

    it('tells acting IT Admins and the Super Admin once for the case', async () => {
      const first = notifierOf({
        superAdmin: 'sa',
        actingByDept: { d1: { inCharge: 'it1', usable: ['it1'] } },
      });
      const again = notifierOf({
        superAdmin: 'sa',
        actingByDept: { d1: { inCharge: 'it1', usable: ['it1'] } },
        alreadyTold: true,
      });

      expect(await first.notifier.accountLockOverdue(TX, facts)).toBe(true);
      expect(await again.notifier.accountLockOverdue(TX, facts)).toBe(false);
      expect(recipients(first.told, 'ACCOUNT_LOCK_OVERDUE')).toEqual(['it1', 'sa']);
    });
  });

  describe('departure events tell acting IT Admins or fallback to usable Super Admin', () => {
    const departure = (eventKind: 'DEPARTURE_RECORDED' | 'DEPARTURE_LAST_DAY_CHANGED' | 'DEPARTURE_CANCELLED') => ({
      organizationId: ORGANIZATION,
      employeeId: 'leaver',
      departmentId: 'd1',
      eventKind,
      eventId: 'c1',
      subjectType: 'OFFBOARDING_CASE',
      effectiveOn: '2026-10-30',
    });

    it.each(['DEPARTURE_RECORDED', 'DEPARTURE_LAST_DAY_CHANGED', 'DEPARTURE_CANCELLED'] as const)(
      'adds acting IT Admins (in-charge and substitute) for %s',
      async (kind) => {
        const { notifier, told } = notifierOf({
          heads: { d1: 'head' },
          actingByDept: { d1: { inCharge: 'it1', substitute: 'sub1', usable: ['it1', 'sub1'] } },
        });

        await notifier.eventRecorded(TX, departure(kind));

        expect(recipients(told, 'PERSONNEL_EVENT_RECORDED')).toEqual(['head', 'it1', 'leaver', 'sub1']);
      },
    );

    it('falls back to usable Super Admin when acting IT Admin set is empty on departure event', async () => {
      const { notifier, told } = notifierOf({
        heads: { d1: 'head' },
        usableSuperAdmin: 'sa',
        actingByDept: {},
      });

      await notifier.eventRecorded(TX, departure('DEPARTURE_RECORDED'));

      expect(recipients(told, 'PERSONNEL_EVENT_RECORDED')).toEqual(['head', 'leaver', 'sa']);
    });
  });
});
