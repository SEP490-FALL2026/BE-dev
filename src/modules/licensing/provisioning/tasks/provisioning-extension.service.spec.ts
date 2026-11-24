import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../../notifications/public/notifications.api';
import type { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { ProvisioningTaskRepo } from '../provisioning-task.repo';
import { ProvisioningExtensionService } from './provisioning-extension.service';

describe('ProvisioningExtensionService (defaultAssignee & unplaced notice)', () => {
  it('assigns substitute ?? inCharge via workDepartmentsOf + itAdminsActingFor in tx', async () => {
    const tx = { name: 'tx' } as unknown as DbTx;
    const insert = jest.fn().mockResolvedValue({ id: 'task-ext-1' });
    const workDepartmentsOf = jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']]));
    const itAdminsActingFor = jest
      .fn()
      .mockResolvedValue(
        new Map([
          ['dept-1', { inCharge: 'it-1', substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-1', 'it-sub'] }],
        ]),
      );
    const notifyInApp = jest.fn();
    const service = new ProvisioningExtensionService(
      { insert } as unknown as ProvisioningTaskRepo,
      {
        getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
        businessToday: jest.fn().mockResolvedValue('2026-11-23'),
        workDepartmentsOf,
        itAdminsActingFor,
        unplacedAmong: jest.fn().mockResolvedValue(new Set()),
      } as unknown as OrganizationReadApi,
      {
        findUsableItAdminEmployeeIds: jest.fn(),
        findUsableSuperAdminEmployeeId: jest.fn(),
      } as unknown as IdentityAccessApi,
      { getValue: jest.fn().mockResolvedValue('3') } as unknown as OperatingParametersApi,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
      { notifyInApp } as unknown as NotificationsApi,
    );

    await service.open(tx, { appUserId: 'app-1' } as AuthenticatedPrincipal, {
      assignmentId: 'asg-1',
      holderEmployeeId: 'emp-1',
      requestId: 'req-1',
      now: new Date('2026-11-23T00:00:00Z'),
    });

    expect(workDepartmentsOf).toHaveBeenCalledWith(['emp-1'], '2026-11-23', tx);
    expect(itAdminsActingFor).toHaveBeenCalledWith(['dept-1'], expect.any(Function), tx);
    expect(insert).toHaveBeenCalledWith(tx, expect.objectContaining({ defaultResponsibleEmployeeId: 'it-sub' }));
    expect(notifyInApp).not.toHaveBeenCalled();
  });

  it('notifies Super Admin with UNPLACED_WORK_WAITING when holder has never been placed', async () => {
    const tx = { name: 'tx' } as unknown as DbTx;
    const insert = jest.fn().mockResolvedValue({ id: 'task-ext-unplaced' });
    const notifyInApp = jest.fn().mockResolvedValue(true);
    const service = new ProvisioningExtensionService(
      { insert } as unknown as ProvisioningTaskRepo,
      {
        getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
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
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
      { notifyInApp } as unknown as NotificationsApi,
    );

    await service.open(tx, { appUserId: 'app-1' } as AuthenticatedPrincipal, {
      assignmentId: 'asg-1',
      holderEmployeeId: 'emp-unplaced',
      requestId: 'req-1',
      now: new Date('2026-11-23T00:00:00Z'),
    });

    expect(notifyInApp).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      recipientEmployeeId: 'emp-sa',
      code: 'UNPLACED_WORK_WAITING',
      subject: null,
      params: { workKind: 'PROVISIONING_TASK', workId: 'task-ext-unplaced', employeeId: 'emp-unplaced' },
      eventKey: 'unplacedWork:PROVISIONING_TASK:task-ext-unplaced',
    });
  });

  it('rejects opening an extension task with EmployeeNotStartedError when holder only has a future placement', async () => {
    const { EmployeeNotStartedError } = await import('../../../organization/public/organization.errors');
    const tx = { name: 'tx' } as unknown as DbTx;
    const insert = jest.fn();
    const notifyInApp = jest.fn();
    const service = new ProvisioningExtensionService(
      { insert } as unknown as ProvisioningTaskRepo,
      {
        getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
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
      { record: jest.fn() } as unknown as AuditApi,
      { notifyInApp } as unknown as NotificationsApi,
    );

    await expect(
      service.open(tx, { appUserId: 'app-1' } as AuthenticatedPrincipal, {
        assignmentId: 'asg-1',
        holderEmployeeId: 'emp-future',
        requestId: 'req-1',
        now: new Date('2026-11-23T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(EmployeeNotStartedError);
    expect(insert).not.toHaveBeenCalled();
    expect(notifyInApp).not.toHaveBeenCalled();
  });
});
