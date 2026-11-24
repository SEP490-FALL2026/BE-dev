import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { DevicesApi } from '../../../devices/public/devices.api';
import { returnDueOn } from '../../../devices/return-task/device-return-task.policy';
import type { PersonalSeat } from '../../../licensing/public/licensing.types';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { PersonnelFileHook, PersonnelFileHookContributions } from '../../public/personnel.extension-points';
import { DeviceRegistrationHook } from '../device-registration.listener';
import type { OffboardingAuditService } from '../offboarding-audit.service';
import type { OffboardingFrame } from '../offboarding-frame.service';
import type { OffboardingLeftService } from '../offboarding-left.service';
import { OffboardingRevocationService } from '../offboarding-revocation.service';
import { OffboardingRefusedError } from '../offboarding.errors';
import type { OffboardingRepo } from '../offboarding.repo';
import type { OffboardingRecord } from '../offboarding.types';

const ACTOR: AuthenticatedPrincipal = {
  subject: 'app-it',
  appUserId: 'app-it',
  sessionId: 'sess-1',
  employeeId: 'emp-it',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
};

const CASE: OffboardingRecord = {
  id: 'case-1',
  organizationId: 'org-1',
  employeeId: 'emp-1',
  departmentId: 'dep-1',
  state: 'LEFT',
  accessBlockMode: 'WITH_LAST_DAY',
  priorWorkState: 'WORKING',
  lastWorkingDay: '2026-10-20',
  departureEffectiveOn: '2026-10-21',
  handoverDueOn: '2026-10-19',
  grounds: { type: null, reference: 'Decision', issuer: null, issuedOn: null },
  headHandover: null,
  placementClosedId: null,
  cancelledPlacementId: null,
  cancelledPlacementDepartmentId: null,
  cancelledPlacementFrom: null,
  recordedByAppUserId: 'app-sa',
  recordedByTicketId: null,
  recordedAt: new Date('2026-10-20T00:00:00Z'),
  leftOn: '2026-10-20',
  leftAt: new Date('2026-10-20T00:00:00Z'),
  leftByAppUserId: 'app-sa',
  cancelledAt: null,
  cancelledByAppUserId: null,
  cancelledByTicketId: null,
  cancelReason: null,
  accountLockAt: new Date('2026-10-20T01:00:00Z'),
  accountLockByAppUserId: 'app-it',
  accountLockNote: 'Locked',
  revocationDueOn: '2026-10-23',
  mailboxLockAt: null,
  mailboxLockByAppUserId: null,
  mailboxLockNote: null,
  closedAt: null,
  closedByAppUserId: null,
};

const seat = (assignmentId: string, subscriptionId: string | null, hasTask = false): PersonalSeat => ({
  assignmentId,
  employeeId: 'emp-1',
  planId: 'plan-1',
  planName: 'Plan 1',
  applicationId: 'app-1',
  applicationName: 'App 1',
  provisioningType: 'K2',
  revocationNote: null,
  dataLossOnRemoval: false,
  subscriptionId,
  grantReason: null,
  effectiveFrom: '2026-01-01',
  validUntil: null,
  revocation: hasTask ? { taskId: `task-${assignmentId}`, status: 'QUEUED', source: 'RETURN' } : null,
});

function harness(
  held: OffboardingRecord,
  seats: PersonalSeat[],
  opened: { created: boolean; reasonAdded: boolean }[],
  bySubstitute = false,
) {
  const tx = { tag: 'tx' };
  const frame = {
    runTechnical: jest.fn((_actor, _id, _opts, fn: (t: unknown, ctx: unknown) => Promise<unknown>) =>
      fn(tx, { held, today: '2026-10-21', recordedOn: '2026-10-20', bySubstitute }),
    ),
  } as unknown as OffboardingFrame;
  const insertChange = jest.fn();
  const repo = { insertChange, find: jest.fn().mockResolvedValue(held) } as unknown as OffboardingRepo;
  let index = 0;
  const openRevocation = jest.fn().mockImplementation(() => {
    const res = opened[index++] ?? { created: false, reasonAdded: false };
    return Promise.resolve({ taskId: `t-${index}`, status: 'QUEUED', ...res });
  });
  const licensing = { listPersonalSeatsOf: jest.fn().mockResolvedValue(seats), openRevocation };
  const writeAccountLock = jest.fn();
  const left = { writeAccountLock } as unknown as OffboardingLeftService;
  const changed = jest.fn();
  const audit = { changed } as unknown as OffboardingAuditService;
  const identity = { findDepartureBlock: jest.fn().mockResolvedValue(null) };
  const service = new OffboardingRevocationService(frame, repo, licensing as never, left, audit, identity as never);
  return { service, openRevocation, insertChange, changed, writeAccountLock };
}

describe('OffboardingRevocationService', () => {
  it('opens in (subscriptionId, assignmentId) order and counts created and reasonAdded', async () => {
    const seats = [seat('asgn-b', 'sub-2', true), seat('asgn-a', 'sub-1', false)];
    const { service, openRevocation, insertChange } = harness(CASE, seats, [
      { created: true, reasonAdded: false },
      { created: false, reasonAdded: true },
    ]);

    const res = await service.openRevocations(ACTOR, 'case-1', {});

    expect(res.created).toBe(1);
    expect(res.reasonAdded).toBe(1);
    expect(
      openRevocation.mock.calls.map((call: unknown[]) => (call[2] as { assignmentId: string }).assignmentId),
    ).toEqual(['asgn-a', 'asgn-b']);
    expect(insertChange).toHaveBeenCalledTimes(1);
  });

  it('throws NOTHING_TO_REVOKE without writing change or audit when all selected seats already carry this case reason', async () => {
    const seats = [seat('asgn-1', 'sub-1', true)];
    const noLockCase: OffboardingRecord = { ...CASE, accountLockAt: null, accountLockByAppUserId: null };
    const { service, insertChange, changed } = harness(noLockCase, seats, [{ created: false, reasonAdded: false }]);

    await expect(
      service.openRevocations(ACTOR, 'case-1', { accountLock: { note: 'Locked now' } }),
    ).rejects.toMatchObject<Partial<OffboardingRefusedError>>({ code: 'NOTHING_TO_REVOKE' });
    expect(insertChange).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it('includes bySubstitute: true in REVOCATIONS_OPENED audit and passes it to writeAccountLock when acting as substitute', async () => {
    const seats = [seat('asgn-1', 'sub-1', false)];
    const noLockCase: OffboardingRecord = { ...CASE, accountLockAt: null, accountLockByAppUserId: null };
    const { service, changed, writeAccountLock } = harness(
      noLockCase,
      seats,
      [{ created: true, reasonAdded: false }],
      true,
    );

    await service.openRevocations(ACTOR, 'case-1', { accountLock: { note: 'Locked now' } });

    expect(writeAccountLock).toHaveBeenCalledWith(
      expect.anything(),
      ACTOR,
      noLockCase,
      { note: 'Locked now' },
      { bySubstitute: true },
    );
    expect(changed).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      noLockCase,
      'OFFBOARDING_CASE.REVOCATIONS_OPENED',
      null,
      expect.objectContaining({ count: 1, created: 1, reasonAdded: 0, bySubstitute: true }),
    );
  });
});

function buildRegistrationHook(record: OffboardingRecord | null = CASE, today = '2026-10-18') {
  let registered: PersonnelFileHook | undefined;
  const hooks = {
    add: jest.fn((_name: string, handlers: PersonnelFileHook) => {
      registered = handlers;
    }),
  } as unknown as PersonnelFileHookContributions;
  const openReturnTasksForDeparture = jest.fn().mockResolvedValue({ taskIds: ['task-1'] });
  const moveReturnTaskDue = jest.fn().mockResolvedValue({ updatedIds: ['task-1'] });
  const cancelReturnTasksOfCase = jest.fn().mockResolvedValue({ cancelledIds: ['task-1'] });
  const endRegistrationsOfHolder = jest.fn().mockResolvedValue({ registrationIds: ['reg-1'] });
  const devices = {
    returnDueOn: jest.fn((facts: Parameters<DevicesApi['returnDueOn']>[0]) => returnDueOn(facts)),
    openReturnTasksForDeparture,
    moveReturnTaskDue,
    cancelReturnTasksOfCase,
    endRegistrationsOfHolder,
  } as unknown as DevicesApi;
  const findCase = jest.fn().mockResolvedValue(record);
  const offboarding = { find: findCase } as unknown as OffboardingRepo;
  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue(today),
  } as unknown as OrganizationReadApi;
  new DeviceRegistrationHook(hooks, devices, offboarding, organizationReads).onModuleInit();
  const tx = { tag: 'tx' } as unknown as DbTx;
  if (!registered) throw new Error('Hook handlers were not registered');

  return {
    registered,
    findCase,
    openReturnTasksForDeparture,
    moveReturnTaskDue,
    cancelReturnTasksOfCase,
    endRegistrationsOfHolder,
    tx,
  };
}

describe('DeviceRegistrationHook', () => {
  it('re-reads case on onRecorded WITH_LAST_DAY and uses lastWorkingDay rather than event.dueOn', async () => {
    const { registered, findCase, openReturnTasksForDeparture, tx } = buildRegistrationHook(CASE, '2026-10-18');
    await registered.onRecorded?.(tx, {
      fileKind: 'OFFBOARDING',
      fileId: 'case-1',
      employeeId: 'emp-1',
      dueOn: '2026-10-21',
    });

    expect(findCase).toHaveBeenCalledWith('case-1', tx);
    expect(openReturnTasksForDeparture).toHaveBeenCalledWith(tx, {
      employeeId: 'emp-1',
      caseId: 'case-1',
      departmentId: 'dep-1',
      dueOn: '2026-10-20',
    });
  });

  it('re-reads case on onRecorded BLOCK_NOW and uses businessToday', async () => {
    const blockNow: OffboardingRecord = { ...CASE, accessBlockMode: 'BLOCK_NOW' };
    const { registered, openReturnTasksForDeparture, tx } = buildRegistrationHook(blockNow, '2026-10-18');
    await registered.onRecorded?.(tx, {
      fileKind: 'OFFBOARDING',
      fileId: 'case-1',
      employeeId: 'emp-1',
      dueOn: '2026-10-21',
    });

    expect(openReturnTasksForDeparture).toHaveBeenCalledWith(tx, {
      employeeId: 'emp-1',
      caseId: 'case-1',
      departmentId: 'dep-1',
      dueOn: '2026-10-18',
    });
  });

  it('re-reads case on onDueChanged and calls moveReturnTaskDue', async () => {
    const moved: OffboardingRecord = { ...CASE, lastWorkingDay: '2026-10-28', departureEffectiveOn: '2026-10-29' };
    const { registered, moveReturnTaskDue, tx } = buildRegistrationHook(moved, '2026-10-18');
    await registered.onDueChanged?.(tx, {
      fileKind: 'OFFBOARDING',
      fileId: 'case-1',
      employeeId: 'emp-1',
      dueOn: '2026-10-29',
      previousDueOn: '2026-10-21',
    });

    expect(moveReturnTaskDue).toHaveBeenCalledWith(tx, { caseId: 'case-1', dueOn: '2026-10-28' });
  });

  it('cancels return tasks before checking accessBlockInForce on onCancelled and ignores TRANSFER events', async () => {
    const order: string[] = [];
    const {
      registered,
      openReturnTasksForDeparture,
      moveReturnTaskDue,
      cancelReturnTasksOfCase,
      endRegistrationsOfHolder,
      tx,
    } = buildRegistrationHook(CASE);
    cancelReturnTasksOfCase.mockImplementation(() => {
      order.push('cancel');
      return Promise.resolve({ cancelledIds: ['task-1'] });
    });
    endRegistrationsOfHolder.mockImplementation(() => {
      order.push('end');
      return Promise.resolve({ registrationIds: ['reg-1'] });
    });

    await registered.onCancelled?.(tx, {
      fileKind: 'OFFBOARDING',
      fileId: 'case-1',
      employeeId: 'emp-1',
      dueOn: '2026-10-21',
      accessBlockInForce: false,
    });
    expect(order).toEqual(['cancel']);

    order.length = 0;
    await registered.onCancelled?.(tx, {
      fileKind: 'OFFBOARDING',
      fileId: 'case-1',
      employeeId: 'emp-1',
      dueOn: '2026-10-21',
      accessBlockInForce: true,
    });
    expect(order).toEqual(['cancel', 'end']);
    expect(endRegistrationsOfHolder).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ employeeId: 'emp-1', cause: 'DEPARTURE_BLOCKED' }),
    );

    await registered.onRecorded?.(tx, {
      fileKind: 'TRANSFER',
      fileId: 'tr-1',
      employeeId: 'emp-1',
      dueOn: '2026-10-21',
    });
    await registered.onDueChanged?.(tx, {
      fileKind: 'TRANSFER',
      fileId: 'tr-1',
      employeeId: 'emp-1',
      dueOn: '2026-10-25',
      previousDueOn: '2026-10-21',
    });
    await registered.onCancelled?.(tx, {
      fileKind: 'TRANSFER',
      fileId: 'tr-1',
      employeeId: 'emp-1',
      dueOn: '2026-10-21',
      accessBlockInForce: true,
    });
    expect(openReturnTasksForDeparture).not.toHaveBeenCalled();
    expect(moveReturnTaskDue).not.toHaveBeenCalled();
  });
});
