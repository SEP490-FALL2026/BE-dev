import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationApi } from '../../organization/public/organization.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { RegistryRepo, RegistrationRecord } from '../registry/registry.repo';
import type { DeviceReturnTaskNotifier } from './device-return-task-notifier.service';
import type { DeviceReturnTaskRepo } from './device-return-task.repo';
import { DeviceReturnTaskService } from './device-return-task.service';
import type { ReturnTaskRecord } from './device-return-task.types';

const reg = (id: string, deviceId: string): RegistrationRecord => ({
  id,
  organizationId: 'org-1',
  deviceId,
  holderEmployeeId: 'emp-1',
  validFrom: '2026-10-01',
  validUntil: null,
  endedAt: null,
  endCause: null,
  collectorInstalled: false,
  acknowledgedFrom: null,
  collectionStoppedAt: null,
});

const task = (id: string, overrides: Partial<ReturnTaskRecord> = {}): ReturnTaskRecord => ({
  id,
  organizationId: 'org-1',
  deviceId: 'dev-1',
  registrationId: 'reg-1',
  employeeId: 'emp-1',
  offboardingCaseId: 'case-1',
  departmentId: 'dep-1',
  dueOn: '2026-11-30',
  state: 'OPEN',
  conditionOnReceipt: null,
  softwareRemoval: null,
  softwareRemovalNote: null,
  outcomeNote: null,
  handledByAppUserId: null,
  handledAt: null,
  overdueNoticedOn: null,
  createdAt: new Date('2026-11-20T00:00:00.000Z'),
  ...overrides,
});

function buildService() {
  const registry = {
    lockOpenRegistrationsOfHolder: jest.fn(),
    findDevice: jest.fn().mockResolvedValue({ assetCode: 'LAP-26-0002' }),
  } as unknown as jest.Mocked<Pick<RegistryRepo, 'lockOpenRegistrationsOfHolder' | 'findDevice'>>;
  const repo = {
    findExistingRegistrationIds: jest.fn(),
    insertOpen: jest.fn(),
    lockOpenByCaseId: jest.fn(),
    updateDueOn: jest.fn(),
    markCancelled: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<
      DeviceReturnTaskRepo,
      'findExistingRegistrationIds' | 'insertOpen' | 'lockOpenByCaseId' | 'updateDueOn' | 'markCancelled'
    >
  >;
  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue('2026-11-25'),
  } as unknown as jest.Mocked<Pick<OrganizationReadApi, 'businessToday'>>;
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Pick<AuditApi, 'record'>>;
  const endUnplacedWorkDesignations = jest.fn().mockResolvedValue(0);
  const organization = { endUnplacedWorkDesignations } as unknown as OrganizationApi;
  const waitingIfUnassigned = jest.fn().mockResolvedValue(false);
  const notifier = { waitingIfUnassigned } as unknown as DeviceReturnTaskNotifier;

  const service = new DeviceReturnTaskService(
    registry as unknown as RegistryRepo,
    repo as unknown as DeviceReturnTaskRepo,
    organization,
    organizationReads as unknown as OrganizationReadApi,
    audit as unknown as AuditApi,
    notifier,
  );
  return {
    service,
    registry,
    repo,
    organizationReads,
    endUnplacedWorkDesignations,
    audit,
    waitingIfUnassigned,
    tx: { tag: 'tx' } as unknown as DbTx,
  };
}

describe('DeviceReturnTaskService', () => {
  it('opens one task per missing open registration, preserves null departmentId, and audits each creation', async () => {
    const { service, registry, repo, audit, waitingIfUnassigned, tx } = buildService();
    registry.lockOpenRegistrationsOfHolder.mockResolvedValue([reg('reg-1', 'dev-1'), reg('reg-2', 'dev-2')]);
    repo.findExistingRegistrationIds.mockResolvedValue(new Set(['reg-1']));
    const createdTask = task('task-2', { deviceId: 'dev-2', registrationId: 'reg-2', departmentId: null });
    repo.insertOpen.mockResolvedValue(createdTask);

    const result = await service.openForDeparture(tx, {
      employeeId: 'emp-1',
      caseId: 'case-1',
      departmentId: null,
      dueOn: '2026-11-30',
    });

    expect(result).toEqual({ taskIds: ['task-2'] });
    expect(repo.insertOpen).toHaveBeenCalledTimes(1);
    expect(repo.insertOpen).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      deviceId: 'dev-2',
      registrationId: 'reg-2',
      employeeId: 'emp-1',
      offboardingCaseId: 'case-1',
      departmentId: null,
      dueOn: '2026-11-30',
    });
    expect(waitingIfUnassigned).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      task: createdTask,
      assetCode: 'LAP-26-0002',
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorKind: 'SYSTEM',
        action: 'DEVICE_RETURN_TASK.OPENED',
        resourceType: 'DeviceReturnTask',
        resourceId: 'task-2',
      }),
    );
  });

  it('returns empty without querying tasks when holder has no open registrations', async () => {
    const { service, registry, repo, tx } = buildService();
    registry.lockOpenRegistrationsOfHolder.mockResolvedValue([]);

    const result = await service.openForDeparture(tx, {
      employeeId: 'emp-1',
      caseId: 'case-1',
      departmentId: 'dep-1',
      dueOn: '2026-11-30',
    });

    expect(result).toEqual({ taskIds: [] });
    expect(repo.findExistingRegistrationIds).not.toHaveBeenCalled();
  });

  it('updates due dates and clears overdue notice only when new due date is today or later', async () => {
    const { service, repo, organizationReads, audit, tx } = buildService();
    organizationReads.businessToday.mockResolvedValue('2026-11-25');
    repo.lockOpenByCaseId.mockResolvedValue([task('task-1', { dueOn: '2026-11-20', overdueNoticedOn: '2026-11-24' })]);

    const cleared = await service.moveDue(tx, { caseId: 'case-1', dueOn: '2026-11-25' });
    expect(cleared).toEqual({ updatedIds: ['task-1'] });
    expect(repo.updateDueOn).toHaveBeenCalledWith(tx, 'task-1', {
      dueOn: '2026-11-25',
      clearOverdueNotice: true,
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'DEVICE_RETURN_TASK.DUE_CHANGED',
        after: { dueOn: '2026-11-25', overdueNoticedOn: null },
      }),
    );

    repo.lockOpenByCaseId.mockResolvedValue([task('task-2', { dueOn: '2026-11-20', overdueNoticedOn: '2026-11-24' })]);
    const kept = await service.moveDue(tx, { caseId: 'case-1', dueOn: '2026-11-22' });
    expect(kept).toEqual({ updatedIds: ['task-2'] });
    expect(repo.updateDueOn).toHaveBeenLastCalledWith(tx, 'task-2', {
      dueOn: '2026-11-22',
      clearOverdueNotice: false,
    });
  });

  it('cancels all open tasks of the case, closes unplaced designations, and records audit events', async () => {
    const { service, repo, audit, endUnplacedWorkDesignations, tx } = buildService();
    const at = new Date('2026-11-24T12:00:00.000Z');
    repo.lockOpenByCaseId.mockResolvedValue([task('task-1'), task('task-2', { deviceId: 'dev-2' })]);

    const result = await service.cancelOfCase(tx, { caseId: 'case-1', at });

    expect(result).toEqual({ cancelledIds: ['task-1', 'task-2'] });
    expect(repo.markCancelled).toHaveBeenCalledTimes(2);
    expect(endUnplacedWorkDesignations).toHaveBeenCalledWith(tx, {
      workKind: 'DEVICE_RETURN_TASK',
      workId: 'task-1',
      endedByAppUserId: null,
      endedAt: at,
    });
    expect(endUnplacedWorkDesignations).toHaveBeenCalledWith(tx, {
      workKind: 'DEVICE_RETURN_TASK',
      workId: 'task-2',
      endedByAppUserId: null,
      endedAt: at,
    });
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorKind: 'SYSTEM',
        action: 'DEVICE_RETURN_TASK.CANCELLED',
        resourceId: 'task-1',
      }),
    );
  });
});
