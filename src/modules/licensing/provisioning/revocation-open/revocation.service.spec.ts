import { RevocationService } from '../revocation.service';
import type { ProvisioningTaskRepo } from '../provisioning-task.repo';
import type { ProvisioningTaskReasonRepo } from '../provisioning-task-reason.repo';
import type { AssignmentEndService } from '../../assignment/assignment-end.service';
import type { CatalogApi } from '../../../catalog/public/catalog.api';
import type { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../../notifications/public/notifications.api';
import type { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { ProvisioningTaskFrame } from '../provisioning-task-frame.service';
import { RevocationTaskFactory } from '../revocation-task-factory.service';
import type { RevocationRecorder } from '../revocation-recorder.service';
import type { RevocationReadRepo } from '../revocation-read.repo';
import type { SystemActor } from '../../public/licensing.types';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';

describe('RevocationService.open (noReopenAfterFailure)', () => {
  const tx = {} as DbTx;
  const actor: SystemActor = { kind: 'SYSTEM', correlationId: 'transfer-grace:tr-1' };
  const assignment = {
    id: 'asg-1',
    kind: 'PERSONAL',
    planId: 'plan-1',
    employeeId: 'emp-1',
    validUntil: null,
    failedAt: null,
    cancelledAt: null,
  };

  function makeSut(overrides?: { closedFailed?: { id: string } | null }) {
    const create = jest.fn().mockResolvedValue({ id: 'new-task-1', status: 'QUEUED' });
    const record = jest.fn().mockResolvedValue(undefined);
    const findClosedFailedRevocationFor = jest.fn().mockResolvedValue(overrides?.closedFailed ?? null);

    const tasks = { lockLiveRevocation: jest.fn().mockResolvedValue(null) } as unknown as ProvisioningTaskRepo;
    const reasons = { find: jest.fn().mockResolvedValue(null) } as unknown as ProvisioningTaskReasonRepo;
    const ending = { lock: jest.fn().mockResolvedValue(assignment) } as unknown as AssignmentEndService;
    const catalog = {
      getPlanRevocationInfo: jest
        .fn()
        .mockResolvedValue([{ planId: 'plan-1', applicationId: 'app-1', provisioningType: 'K2' }]),
    } as unknown as CatalogApi;
    const frame = {
      selfExecutionMode: jest.fn().mockResolvedValue('ALLOW'),
      requireOrganizationId: jest.fn().mockResolvedValue('org-1'),
    } as unknown as ProvisioningTaskFrame;
    const factory = { create } as unknown as RevocationTaskFactory;
    const recorder = { record } as unknown as RevocationRecorder;
    const queries = { findClosedFailedRevocationFor } as unknown as RevocationReadRepo;

    const service = new RevocationService(tasks, reasons, ending, catalog, frame, factory, recorder, queries);

    return { service, create, record, findClosedFailedRevocationFor };
  }

  const baseInput = {
    assignmentId: 'asg-1',
    source: 'TRANSFER',
    decision: { decidedRole: 'TRANSFER_PROCESS', referenceKind: 'DEPARTMENT_TRANSFER', referenceId: 'tr-1' },
  };

  it('returns the CLOSED_FAILED task without creating a new one when noReopenAfterFailure is true and a closed-failed task exists for that source and reference', async () => {
    const { service, create, record, findClosedFailedRevocationFor } = makeSut({
      closedFailed: { id: 'failed-task-1' },
    });

    const result = await service.open(tx, actor, { ...baseInput, noReopenAfterFailure: true });

    expect(result).toEqual({
      taskId: 'failed-task-1',
      created: false,
      reasonAdded: false,
      status: 'CLOSED_FAILED',
    });
    expect(findClosedFailedRevocationFor).toHaveBeenCalledWith(tx, 'asg-1', 'TRANSFER', 'tr-1');
    expect(create).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('creates a new task when noReopenAfterFailure is false even if a CLOSED_FAILED task exists', async () => {
    const { service, create, record, findClosedFailedRevocationFor } = makeSut({
      closedFailed: { id: 'failed-task-1' },
    });

    const result = await service.open(tx, actor, { ...baseInput, noReopenAfterFailure: false });

    expect(result).toEqual({
      taskId: 'new-task-1',
      created: true,
      reasonAdded: false,
      status: 'QUEUED',
    });
    expect(findClosedFailedRevocationFor).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('creates a new task when noReopenAfterFailure is true and no CLOSED_FAILED task exists for that source and reference', async () => {
    const { service, create, record } = makeSut({ closedFailed: null });

    const result = await service.open(tx, actor, { ...baseInput, noReopenAfterFailure: true });

    expect(result).toEqual({
      taskId: 'new-task-1',
      created: true,
      reasonAdded: false,
      status: 'QUEUED',
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
  });
});

describe('RevocationTaskFactory (unplaced work waiting notice)', () => {
  const tx = {} as DbTx;
  const actor: SystemActor = { kind: 'SYSTEM', correlationId: 'offboarding:case-1' };

  it('notifies usable Super Admin with UNPLACED_WORK_WAITING when opening a revocation for a never-placed employee', async () => {
    const insertRevocation = jest.fn().mockResolvedValue({ id: 'rev-task-1', status: 'QUEUED' });
    const notifyInApp = jest.fn().mockResolvedValue(true);
    const factory = new RevocationTaskFactory(
      { insertRevocation } as unknown as ProvisioningTaskRepo,
      {
        businessToday: jest.fn().mockResolvedValue('2026-11-23'),
        workDepartmentsOf: jest.fn().mockResolvedValue(new Map()),
        itAdminsActingFor: jest.fn(),
        notStartedAmong: jest.fn().mockResolvedValue(new Set()),
        unplacedAmong: jest.fn().mockResolvedValue(new Set(['emp-unplaced'])),
      } as unknown as OrganizationReadApi,
      {
        findUsableItAdminEmployeeIds: jest.fn(),
        findUsableSuperAdminEmployeeId: jest.fn().mockResolvedValue('emp-sa'),
      } as unknown as IdentityAccessApi,
      { getValue: jest.fn().mockResolvedValue('3') } as unknown as OperatingParametersApi,
      { notifyInApp } as unknown as NotificationsApi,
    );

    await factory.create(tx, actor, {
      organizationId: 'org-1',
      assignment: { id: 'asg-1', employeeId: 'emp-unplaced' },
      source: 'DEPARTURE',
      now: new Date('2026-11-23T00:00:00Z'),
    });

    expect(notifyInApp).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      recipientEmployeeId: 'emp-sa',
      code: 'UNPLACED_WORK_WAITING',
      subject: null,
      params: { workKind: 'PROVISIONING_TASK', workId: 'rev-task-1', employeeId: 'emp-unplaced' },
      eventKey: 'unplacedWork:PROVISIONING_TASK:rev-task-1',
    });
  });

  it('does not notify UNPLACED_WORK_WAITING when beneficiary has a work department', async () => {
    const insertRevocation = jest.fn().mockResolvedValue({ id: 'rev-task-2', status: 'QUEUED' });
    const notifyInApp = jest.fn();
    const factory = new RevocationTaskFactory(
      { insertRevocation } as unknown as ProvisioningTaskRepo,
      {
        businessToday: jest.fn().mockResolvedValue('2026-11-23'),
        workDepartmentsOf: jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']])),
        itAdminsActingFor: jest.fn().mockResolvedValue(new Map([['dept-1', { defaultAssignee: 'it-1' }]])),
        unplacedAmong: jest.fn(),
      } as unknown as OrganizationReadApi,
      {
        findUsableItAdminEmployeeIds: jest.fn(),
        findUsableSuperAdminEmployeeId: jest.fn(),
      } as unknown as IdentityAccessApi,
      { getValue: jest.fn().mockResolvedValue('3') } as unknown as OperatingParametersApi,
      { notifyInApp } as unknown as NotificationsApi,
    );

    await factory.create(tx, actor, {
      organizationId: 'org-1',
      assignment: { id: 'asg-1', employeeId: 'emp-1' },
      source: 'DEPARTURE',
      now: new Date('2026-11-23T00:00:00Z'),
    });

    expect(notifyInApp).not.toHaveBeenCalled();
  });

  it('rejects creating a revocation task with EmployeeNotStartedError when the employee only has a future placement', async () => {
    const { EmployeeNotStartedError } = await import('../../../organization/public/organization.errors');
    const insertRevocation = jest.fn();
    const notifyInApp = jest.fn();
    const factory = new RevocationTaskFactory(
      { insertRevocation } as unknown as ProvisioningTaskRepo,
      {
        businessToday: jest.fn().mockResolvedValue('2026-11-23'),
        workDepartmentsOf: jest.fn().mockResolvedValue(new Map()),
        itAdminsActingFor: jest.fn(),
        notStartedAmong: jest.fn().mockResolvedValue(new Set(['emp-future'])),
        unplacedAmong: jest.fn(),
      } as unknown as OrganizationReadApi,
      {
        findUsableItAdminEmployeeIds: jest.fn(),
        findUsableSuperAdminEmployeeId: jest.fn(),
      } as unknown as IdentityAccessApi,
      { getValue: jest.fn().mockResolvedValue('3') } as unknown as OperatingParametersApi,
      { notifyInApp } as unknown as NotificationsApi,
    );

    await expect(
      factory.create(tx, actor, {
        organizationId: 'org-1',
        assignment: { id: 'asg-1', employeeId: 'emp-future' },
        source: 'DEPARTURE',
        now: new Date('2026-11-23T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(EmployeeNotStartedError);
    expect(insertRevocation).not.toHaveBeenCalled();
    expect(notifyInApp).not.toHaveBeenCalled();
  });
});
