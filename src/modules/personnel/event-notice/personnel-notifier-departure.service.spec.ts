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

function notifierOf(world: {
  superAdmin?: string | null;
  usableSuperAdmin?: string | null;
  actingByDept?: Record<string, ActingSpec>;
  heads?: Record<string, string>;
  workDepartments?: Record<string, string>;
  unplaced?: string[];
}) {
  const told: InAppNotificationInput[] = [];
  const notifications = {
    notifyInApp: jest.fn((_tx: DbTx, input: InAppNotificationInput) => {
      told.push(input);
      return Promise.resolve(true);
    }),
  } as unknown as NotificationsApi;
  const usableAcross = new Set(Object.values(world.actingByDept ?? {}).flatMap((s) => s.usable ?? []));
  const organization = {
    getDepartmentHeads: (ids: string[]) =>
      Promise.resolve(
        new Map(ids.flatMap((id) => (world.heads?.[id] ? [[id, { employeeId: world.heads[id] }] as const] : []))),
      ),
    workDepartmentsOf: jest.fn((ids: readonly string[]) =>
      Promise.resolve(
        new Map(ids.flatMap((id) => (world.workDepartments?.[id] ? [[id, world.workDepartments[id]] as const] : []))),
      ),
    ),
    unplacedAmong: jest.fn((ids: readonly string[]) =>
      Promise.resolve(new Set(ids.filter((id) => (world.unplaced ?? []).includes(id)))),
    ),
    itAdminsActingFor: jest.fn(
      async (deptIds: readonly string[], usableAmong: (ids: string[]) => Promise<Set<string>>) =>
        new Map(
          await Promise.all(
            deptIds.map(async (deptId) => {
              const spec = world.actingByDept?.[deptId];
              if (!spec)
                return [
                  deptId,
                  {
                    inCharge: null as string | null,
                    substitute: null as string | null,
                    defaultAssignee: null as string | null,
                    actors: [] as string[],
                  },
                ] as const;
              const candidates = [spec.inCharge, spec.substitute].filter((id): id is string => Boolean(id));
              const usable = candidates.length === 0 ? new Set<string>() : await usableAmong(candidates);
              const inCharge = spec.inCharge && usable.has(spec.inCharge) ? spec.inCharge : null;
              const substitute = spec.substitute && usable.has(spec.substitute) ? spec.substitute : null;
              const actors = [inCharge, substitute].filter((id): id is string => id !== null);
              return [deptId, { inCharge, substitute, defaultAssignee: substitute ?? inCharge, actors }] as const;
            }),
          ),
        ),
    ),
  } as unknown as OrganizationReadApi;
  const findAllUsableItAdminEmployeeIds = jest.fn();
  const identity = {
    getSuperAdminHolder: () => Promise.resolve(world.superAdmin ? { employeeId: world.superAdmin } : null),
    findUsableSuperAdminEmployeeId: jest
      .fn()
      .mockResolvedValue(world.usableSuperAdmin !== undefined ? world.usableSuperAdmin : (world.superAdmin ?? null)),
    findUsableItAdminEmployeeIds: jest.fn((ids: readonly string[]) =>
      Promise.resolve(new Set(ids.filter((id) => usableAcross.has(id)))),
    ),
    findAllUsableItAdminEmployeeIds,
  } as unknown as IdentityAccessApi;

  return {
    notifier: new PersonnelNotifier(notifications, organization, identity),
    told,
    findAllUsableItAdminEmployeeIds,
  };
}

const recipients = (told: InAppNotificationInput[], code: string) =>
  told
    .filter((notice) => notice.code === code)
    .map((notice) => `${notice.recipientEmployeeId}:${String(notice.params.audience ?? '-')}`)
    .sort();

const facts = { organizationId: ORGANIZATION, employeeId: 'leaver', departmentId: 'd1', caseId: 'c1' };

describe('departure, transfer, and handover notifications', () => {
  const blocked = { ...facts, blockedOn: '2026-10-01', revocationDueOn: '2026-10-02', markLeft: true };

  it('tells the IT Admin to block the company account only while it is not blocked yet', async () => {
    const open = notifierOf({ superAdmin: 'sa', actingByDept: { d1: { inCharge: 'it1', usable: ['it1'] } } });
    const locked = notifierOf({ superAdmin: 'sa', actingByDept: { d1: { inCharge: 'it1', usable: ['it1'] } } });

    await open.notifier.departureAccessBlocked(TX, { ...blocked, accountLocked: false });
    await locked.notifier.departureAccessBlocked(TX, { ...blocked, accountLocked: true });

    expect(recipients(open.told, 'DEPARTURE_ACCESS_BLOCKED')).toEqual(['it1:IT_ADMIN', 'sa:SUPER_ADMIN']);
    expect(recipients(locked.told, 'DEPARTURE_ACCESS_BLOCKED')).toEqual(['sa:SUPER_ADMIN']);

    const unplaced = notifierOf({ superAdmin: 'sa', actingByDept: {} });
    await unplaced.notifier.departureAccessBlocked(TX, { ...blocked, departmentId: null, accountLocked: false });
    expect(recipients(unplaced.told, 'DEPARTURE_ACCESS_BLOCKED')).toEqual(['sa:SUPER_ADMIN_AND_IT_ADMIN']);
  });

  it('does not tell the person who left when they are the Super Admin', async () => {
    const { notifier, told } = notifierOf({
      superAdmin: 'leaver',
      actingByDept: { d1: { inCharge: 'it1', usable: ['it1'] } },
    });

    await notifier.departureAccessBlocked(TX, { ...blocked, accountLocked: false });
    await notifier.revocationOverdue(TX, { ...facts, dueOn: '2026-10-01', rightCount: 1, today: '2026-10-02' });
    await notifier.accountLockOverdue(TX, { ...facts, blockedOn: '2026-10-01' });

    expect(recipients(told, 'DEPARTURE_ACCESS_BLOCKED')).toEqual(['it1:IT_ADMIN']);
    expect(recipients(told, 'REVOCATION_OVERDUE')).toEqual(['it1:-']);
    expect(recipients(told, 'ACCOUNT_LOCK_OVERDUE')).toEqual(['it1:-']);
  });

  it('resolves work department fallback on abruptDeparture when departmentId is null', async () => {
    const { notifier, told } = notifierOf({
      superAdmin: 'sa',
      workDepartments: { leaver: 'd1' },
      actingByDept: { d1: { inCharge: 'it-locked', substitute: 'sub1', usable: ['sub1'] } },
    });

    await notifier.abruptDeparture(TX, {
      organizationId: ORGANIZATION,
      employeeId: 'leaver',
      departmentId: null,
      caseId: 'c1',
      effectiveOn: '2026-10-29',
      lastDayInOffice: '2026-10-28',
    });

    expect(recipients(told, 'ABRUPT_DEPARTURE_RECORDED')).toEqual(['sa:-', 'sub1:-']);
  });

  it('tells acting IT Admins or Super Admin fallback on transferGraceStarted and transferRightsRevoking', async () => {
    const { notifier, told } = notifierOf({
      usableSuperAdmin: 'sa',
      heads: { from: 'h-from', to: 'h-to' },
      actingByDept: { from: { inCharge: 'it-from', substitute: 'sub-from', usable: ['it-from', 'sub-from'] }, to: {} },
    });

    await notifier.transferGraceStarted(TX, {
      organizationId: ORGANIZATION,
      transferId: 'tr-1',
      employeeId: 'mover',
      fromDepartmentId: 'from',
      toDepartmentId: 'to',
      graceEndsOn: '2026-11-10',
      today: '2026-11-01',
    });
    await notifier.transferRightsRevoking(TX, {
      organizationId: ORGANIZATION,
      transferId: 'tr-1',
      employeeId: 'mover',
      toDepartmentId: 'to',
      rightCount: 2,
    });

    expect(recipients(told, 'TRANSFER_GRACE_STARTED')).toEqual([
      'h-from:HEAD',
      'h-to:HEAD',
      'it-from:IT_ADMIN',
      'mover:MOVER',
      'sa:IT_ADMIN',
      'sub-from:IT_ADMIN',
    ]);
    expect(recipients(told, 'TRANSFER_RIGHTS_REVOKING')).toEqual(['mover:-', 'sa:-']);
  });

  it('notifies only usable Super Admin on itHandoverPending and excludes leaver', async () => {
    const ok = notifierOf({ usableSuperAdmin: 'sa' });
    const self = notifierOf({ usableSuperAdmin: 'leaver' });

    const countOk = await ok.notifier.itHandoverPending(TX, {
      organizationId: ORGANIZATION,
      source: { kind: 'OFFBOARDING_CASE', id: 'c1' },
      employeeId: 'leaver',
      dueOn: '2026-11-10',
    });
    const countSelf = await self.notifier.itHandoverPending(TX, {
      organizationId: ORGANIZATION,
      source: { kind: 'OFFBOARDING_CASE', id: 'c1' },
      employeeId: 'leaver',
      dueOn: '2026-11-10',
    });

    expect(countOk).toBe(1);
    expect(recipients(ok.told, 'IT_ADMIN_HANDOVER_PENDING')).toEqual(['sa:-']);
    expect(ok.findAllUsableItAdminEmployeeIds).not.toHaveBeenCalled();
    expect(countSelf).toBe(0);
    expect(self.told).toEqual([]);
  });

  it('notifies usable responsible IT Admin once per (workspace, admin) and falls back to usable Super Admin when absent or affected', async () => {
    const named = notifierOf({
      superAdmin: 'sa',
      usableSuperAdmin: 'sa',
      actingByDept: { d1: { usable: ['it-1'] } },
    });
    const fallback = notifierOf({
      superAdmin: 'sa',
      usableSuperAdmin: 'sa',
      actingByDept: { d1: { usable: ['sa'] } },
    });

    const countNamed = await named.notifier.workspaceAdminNotWorking(TX, {
      organizationId: ORGANIZATION,
      workspaceId: 'ws-1',
      employeeId: 'leaver',
      responsibleItAdminEmployeeId: 'it-1',
      workingAdminCount: 1,
    });
    const countFallbackSelf = await fallback.notifier.workspaceAdminNotWorking(TX, {
      organizationId: ORGANIZATION,
      workspaceId: 'ws-1',
      employeeId: 'leaver',
      responsibleItAdminEmployeeId: 'leaver',
      workingAdminCount: 0,
    });
    const countSuperAsResp = await fallback.notifier.workspaceAdminNotWorking(TX, {
      organizationId: ORGANIZATION,
      workspaceId: 'ws-2',
      employeeId: 'leaver',
      responsibleItAdminEmployeeId: 'sa',
      workingAdminCount: 0,
    });

    expect(countNamed).toBe(1);
    expect(recipients(named.told, 'WORKSPACE_ADMIN_NOT_WORKING')).toEqual(['it-1:-']);
    expect(named.told.find((n) => n.code === 'WORKSPACE_ADMIN_NOT_WORKING')).toMatchObject({
      subject: { type: 'WORKSPACE', id: 'ws-1' },
      params: { workspaceId: 'ws-1', employeeId: 'leaver', workingAdminCount: 1 },
      eventKey: 'WORKSPACE_ADMIN_NOT_WORKING:ws-1:leaver',
    });
    expect(countFallbackSelf).toBe(1);
    expect(countSuperAsResp).toBe(1);
    expect(recipients(fallback.told, 'WORKSPACE_ADMIN_NOT_WORKING')).toEqual(['sa:-', 'sa:-']);
  });

  it('notifies usable Super Admin with UNPLACED_WORK_WAITING for a never-placed offboarding case only', async () => {
    const unplaced = notifierOf({ usableSuperAdmin: 'sa', unplaced: ['emp-u'] });
    const placed = notifierOf({ usableSuperAdmin: 'sa', unplaced: [] });

    await unplaced.notifier.unplacedOffboardingWaiting(TX, {
      organizationId: ORGANIZATION,
      caseId: 'case-u',
      employeeId: 'emp-u',
    });
    await placed.notifier.unplacedOffboardingWaiting(TX, {
      organizationId: ORGANIZATION,
      caseId: 'case-p',
      employeeId: 'emp-p',
    });

    expect(unplaced.told).toEqual([
      {
        organizationId: ORGANIZATION,
        recipientEmployeeId: 'sa',
        code: 'UNPLACED_WORK_WAITING',
        subject: null,
        params: { workKind: 'OFFBOARDING_CASE', workId: 'case-u', employeeId: 'emp-u' },
        eventKey: 'unplacedWork:OFFBOARDING_CASE:case-u',
      },
    ]);
    expect(placed.told).toEqual([]);
  });
});

describe('departure access blocked notices', () => {
  const blockedFacts = {
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

  it('tells Super Admin to mark left and acting IT Admins (in-charge + substitute) to block and revoke', async () => {
    const { notifier, told } = notifierOf({
      superAdmin: 'sa',
      actingByDept: { d1: { inCharge: 'it1', substitute: 'sub1', usable: ['it1', 'sub1'] } },
    });

    await notifier.departureAccessBlocked(TX, blockedFacts);

    expect(audiences(told)).toEqual([
      ['sa', 'SUPER_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:SUPER_ADMIN'],
      ['it1', 'IT_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:IT_ADMIN'],
      ['sub1', 'IT_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:IT_ADMIN'],
    ]);
  });

  it('sends one merged notice (mark left + block account + open revocation) to the Super Admin when no IT Admin can act', async () => {
    const empty = notifierOf({ superAdmin: 'sa', actingByDept: {} });
    await empty.notifier.departureAccessBlocked(TX, blockedFacts);
    expect(audiences(empty.told)).toEqual([
      ['sa', 'SUPER_ADMIN_AND_IT_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:SUPER_ADMIN_AND_IT_ADMIN'],
    ]);
    expect(empty.told[0].params).toEqual({
      caseId: 'c1',
      employeeId: 'leaver',
      departmentId: 'd1',
      blockedOn: '2026-10-01',
      revocationDueOn: '2026-10-02',
      audience: 'SUPER_ADMIN_AND_IT_ADMIN',
    });

    const onlyLeaver = notifierOf({
      superAdmin: 'sa',
      actingByDept: { d1: { inCharge: 'leaver', usable: ['leaver'] } },
    });
    await onlyLeaver.notifier.departureAccessBlocked(TX, blockedFacts);
    expect(audiences(onlyLeaver.told)).toEqual([
      ['sa', 'SUPER_ADMIN_AND_IT_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:SUPER_ADMIN_AND_IT_ADMIN'],
    ]);
  });

  it('tells the Super Admin only to mark left when the account is already blocked and nobody else can act', async () => {
    const { notifier, told } = notifierOf({ superAdmin: 'sa', actingByDept: {} });

    await notifier.departureAccessBlocked(TX, { ...blockedFacts, accountLocked: true });

    expect(audiences(told)).toEqual([['sa', 'SUPER_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:SUPER_ADMIN']]);
  });

  it('sends one merged notice when the Super Admin is also the acting IT Admin next to a substitute', async () => {
    const { notifier, told } = notifierOf({
      superAdmin: 'sa',
      actingByDept: { d1: { inCharge: 'sa', substitute: 'sub1', usable: ['sa', 'sub1'] } },
    });

    await notifier.departureAccessBlocked(TX, blockedFacts);

    expect(audiences(told)).toEqual([
      ['sa', 'SUPER_ADMIN_AND_IT_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:SUPER_ADMIN_AND_IT_ADMIN'],
      ['sub1', 'IT_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:IT_ADMIN'],
    ]);
  });

  it('keeps the IT Admin notice for the Super Admin when the person is already marked left', async () => {
    const { notifier, told } = notifierOf({ superAdmin: 'sa', actingByDept: {} });

    await notifier.departureAccessBlocked(TX, { ...blockedFacts, markLeft: false });

    expect(audiences(told)).toEqual([['sa', 'IT_ADMIN', 'DEPARTURE_ACCESS_BLOCKED:c1:IT_ADMIN']]);
  });
});
