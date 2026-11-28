import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { CredentialSessionService } from '../credential/session/credential-session.service';
import type { InitialRecordQueryService } from '../initial-record/initial-record-query.service';
import type { RegistrationEndService } from '../registry/registration-end.service';
import type { RegistryQueryRepo } from '../registry/registry-query.repo';
import type { RegistryRepo } from '../registry/registry.repo';
import type { DeviceReturnTaskRepo } from '../return-task/device-return-task.repo';
import type { DeviceReturnTaskService } from '../return-task/device-return-task.service';
import { DevicesApi } from './devices.api';

describe('DevicesApi', () => {
  it('countReturnTasks resolves active unplaced DEVICE_RETURN_TASK designations for caller when includeTaskIds is omitted', async () => {
    const tx = {} as DbTx;
    const countForScope = jest.fn().mockResolvedValue({ open: 2, overdue: 1 });
    const findActiveUnplacedWorkIdsForDesignee = jest.fn().mockResolvedValue(['task-u1']);
    const api = new DevicesApi(
      {} as RegistrationEndService,
      {} as RegistryRepo,
      {} as CredentialSessionService,
      {} as RegistryQueryRepo,
      {} as DeviceReturnTaskService,
      { countForScope } as unknown as DeviceReturnTaskRepo,
      {} as InitialRecordQueryService,
      { findActiveUnplacedWorkIdsForDesignee } as unknown as OrganizationReadApi,
    );

    const result = await api.countReturnTasks(
      { organizationId: 'org-1', actingDepartmentIds: ['dep-1'], excludeEmployeeId: 'it-1' },
      '2026-11-25',
      tx,
    );

    expect(result).toEqual({ open: 2, overdue: 1 });
    expect(findActiveUnplacedWorkIdsForDesignee).toHaveBeenCalledWith('it-1', 'DEVICE_RETURN_TASK', tx);
    expect(countForScope).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        actingDepartmentIds: ['dep-1'],
        includeTaskIds: ['task-u1'],
        excludeEmployeeId: 'it-1',
      },
      '2026-11-25',
      tx,
    );
  });
});
