import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationApi } from '../../organization/public/organization.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import type { RegistrationEndService } from '../registry/registration-end.service';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import type { DeviceRecord, RegistrationRecord, RegistryRepo } from '../registry/registry.repo';
import type { DeviceReturnTaskRepo } from '../return-task/device-return-task.repo';
import type { ReturnTaskRecord } from '../return-task/device-return-task.types';
import { DeviceReceiptService } from './device-receipt.service';
import {
  DeviceNotHeldError,
  DeviceReturnTaskNotInChargeError,
  DeviceSoftwareRemovalNoteRequiredError,
  DeviceVoidedError,
} from './lifecycle.errors';

interface SetupOptions {
  device?: Partial<DeviceRecord> | null;
  openRegistration?: Partial<RegistrationRecord> | null;
  openReturnTask?: Partial<ReturnTaskRecord> | null;
  workDepartmentId?: string | null;
  inCharge?: string | null;
  substitute?: string | null;
  unplacedDesignee?: string | null;
}

describe('DeviceReceiptService', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-11-24T10:00:00.000Z');
  const actor = (employeeId = 'it-1'): AuthenticatedPrincipal =>
    ({ appUserId: `user-${employeeId}`, employeeId, roles: ['IT_ADMIN'] }) as unknown as AuthenticatedPrincipal;

  function setup(options: SetupOptions = {}) {
    const device: DeviceRecord | null =
      options.device === null
        ? null
        : {
            id: 'dev-1',
            organizationId: 'org-1',
            assetCode: 'LAP-26-0001',
            hostname: 'DES-01',
            os: 'Windows 11',
            condition: 'USABLE',
            conditionNote: null,
            retiredAt: null,
            retirementReason: null,
            retirementKind: null,
            voidedAt: null,
            ...options.device,
          };

    const open: RegistrationRecord | null =
      options.openRegistration === null
        ? null
        : {
            id: 'reg-1',
            organizationId: 'org-1',
            deviceId: 'dev-1',
            holderEmployeeId: 'emp-1',
            validFrom: '2026-10-01',
            validUntil: null,
            endedAt: null,
            endCause: null,
            collectorInstalled: true,
            acknowledgedFrom: null,
            collectionStoppedAt: null,
            ...options.openRegistration,
          };

    const repo = {
      lockDevice: jest.fn().mockResolvedValue(device),
      lockOpenRegistration: jest.fn().mockResolvedValue(open),
      updateCondition: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegistryRepo;
    const taskRecord: ReturnTaskRecord | null = options.openReturnTask
      ? {
          id: 'task-1',
          organizationId: 'org-1',
          deviceId: 'dev-1',
          registrationId: 'reg-1',
          employeeId: 'emp-1',
          offboardingCaseId: 'case-1',
          departmentId: 'dept-1',
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
          ...options.openReturnTask,
        }
      : null;
    const returnTasks = {
      lockOpenByDeviceId: jest.fn().mockResolvedValue(taskRecord),
      markReceived: jest.fn().mockResolvedValue(undefined),
    } as unknown as DeviceReturnTaskRepo;
    const ending = { end: jest.fn().mockResolvedValue(undefined) } as unknown as RegistrationEndService;
    const deptId = options.workDepartmentId === undefined ? 'dept-1' : options.workDepartmentId;
    const actors = [options.inCharge === undefined ? 'it-1' : options.inCharge, options.substitute ?? null].filter(
      (id): id is string => id !== null,
    );
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      businessToday: jest.fn().mockResolvedValue('2026-11-24'),
      notStartedAmong: jest.fn().mockResolvedValue(new Set()),
      workDepartmentsOf: jest.fn().mockResolvedValue(deptId ? new Map([['emp-1', deptId]]) : new Map()),
      itAdminsActingFor: jest.fn().mockResolvedValue(
        deptId
          ? new Map([
              [
                deptId,
                {
                  inCharge: options.inCharge === undefined ? 'it-1' : options.inCharge,
                  substitute: options.substitute ?? null,
                  actors,
                },
              ],
            ])
          : new Map(),
      ),
      itAdminsActingForUnplacedWork: jest.fn().mockResolvedValue(
        options.unplacedDesignee !== undefined
          ? new Map([
              [unplacedWorkKey('DEVICE_RETURN_TASK', taskRecord?.id ?? 'task-1'), options.unplacedDesignee],
              [unplacedWorkKey('DEVICE', device?.id ?? 'dev-1'), options.unplacedDesignee],
            ])
          : new Map(),
      ),
    } as unknown as OrganizationReadApi;
    const endUnplacedWorkDesignations = jest.fn().mockResolvedValue(0);
    const organization = { endUnplacedWorkDesignations } as unknown as OrganizationApi;
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(actors)),
    } as unknown as IdentityAccessApi;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;
    const runner = {
      run: jest.fn().mockImplementation((work: (tx: DbTx) => Promise<unknown>) => work(tx)),
    } as unknown as TransactionRunner;

    const service = new DeviceReceiptService(
      repo,
      ending,
      returnTasks,
      organization,
      organizationReads,
      identity,
      audit,
      runner,
    );

    return { service, repo, ending, returnTasks, audit, endUnplacedWorkDesignations };
  }

  const firstAuditAfter = (audit: AuditApi): Record<string, unknown> => {
    const calls = (audit.record as jest.Mock).mock.calls as Array<[unknown, { after: Record<string, unknown> }]>;
    return calls[0][1].after;
  };

  it('returns an ASSIGNED device to stock with RETURNED cause, updated condition, and audit', async () => {
    const { service, repo, ending, audit } = setup({ substitute: 'it-sub' });

    await service.returnToStock(
      actor('it-sub'),
      'dev-1',
      {
        condition: 'IN_REPAIR',
        conditionNote: 'Fan noisy',
        softwareRemoval: { outcome: 'NOT_REMOVABLE', note: 'OEM license stays' },
      },
      now,
    );

    expect((ending as unknown as { end: jest.Mock }).end).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'reg-1' }),
      { at: now, cause: 'RETURNED', softwareRemoval: { outcome: 'NOT_REMOVABLE', note: 'OEM license stays' } },
      expect.anything(),
    );
    expect((repo as unknown as { updateCondition: jest.Mock }).updateCondition).toHaveBeenCalledWith(
      tx,
      'dev-1',
      'IN_REPAIR',
      'Fan noisy',
    );
    expect(firstAuditAfter(audit)).toEqual({
      condition: 'IN_REPAIR',
      conditionNote: 'Fan noisy',
      endedRegistrationId: 'reg-1',
      softwareRemoval: { outcome: 'NOT_REMOVABLE', note: 'OEM license stays' },
      bySubstitute: true,
    });
  });

  it('rejects VOIDED, RETIRED, IN_STOCK, missing note, and non-acting IT Admin', async () => {
    await expect(
      setup({ device: null }).service.returnToStock(
        actor(),
        'dev-1',
        { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceNotFoundError);
    await expect(
      setup({ device: { voidedAt: now } }).service.returnToStock(
        actor(),
        'dev-1',
        { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceVoidedError);
    await expect(
      setup({ device: { retiredAt: now } }).service.returnToStock(
        actor(),
        'dev-1',
        { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceAlreadyRetiredError);
    await expect(
      setup({ openRegistration: null }).service.returnToStock(
        actor(),
        'dev-1',
        { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceNotHeldError);
    await expect(
      setup().service.returnToStock(
        actor(),
        'dev-1',
        { condition: 'USABLE', softwareRemoval: { outcome: 'NOT_REMOVABLE' } },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceSoftwareRemovalNoteRequiredError);
    await expect(
      setup({ inCharge: 'it-1' }).service.returnToStock(
        actor('it-other'),
        'dev-1',
        { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);
    await expect(
      setup({
        openRegistration: null,
        openReturnTask: { departmentId: 'dept-1' },
        inCharge: 'it-1',
      }).service.returnToStock(
        actor('it-other'),
        'dev-1',
        { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceReturnTaskNotInChargeError);
  });

  it('completes an open return task as RECEIVED when an acting IT Admin returns an awaiting-return machine', async () => {
    const { service, returnTasks, audit } = setup({
      openRegistration: null,
      openReturnTask: { departmentId: 'dept-1', employeeId: 'emp-1' },
      inCharge: 'it-1',
      substitute: 'it-sub',
    });

    await service.returnToStock(
      actor('it-sub'),
      'dev-1',
      { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
      now,
    );

    expect((returnTasks as unknown as { markReceived: jest.Mock }).markReceived).toHaveBeenCalledWith(tx, 'task-1', {
      conditionOnReceipt: 'USABLE',
      softwareRemoval: 'REMOVED',
      softwareRemovalNote: null,
      handledByAppUserId: 'user-it-sub',
      handledAt: now,
    });
    const calls = (audit.record as jest.Mock).mock.calls as Array<
      [unknown, { action: string; resourceId: string; after: Record<string, unknown> }]
    >;
    expect(calls[1]?.[1]).toMatchObject({
      action: 'DEVICE_RETURN_TASK.COMPLETED',
      resourceId: 'task-1',
    });
    expect(calls[1]?.[1].after).toEqual(
      expect.objectContaining({ outcome: 'RECEIVED', viaDeviceReturn: true, bySubstitute: true }),
    );
  });

  it('allows designated IT Admin to complete an unplaced return task via device return and closes designations', async () => {
    const { service, endUnplacedWorkDesignations, audit } = setup({
      openRegistration: null,
      openReturnTask: { departmentId: null, employeeId: 'emp-1' },
      unplacedDesignee: 'it-des',
    });

    await service.returnToStock(
      actor('it-des'),
      'dev-1',
      { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
      now,
    );

    expect(endUnplacedWorkDesignations).toHaveBeenCalledWith(tx, {
      workKind: 'DEVICE_RETURN_TASK',
      workId: 'task-1',
      endedByAppUserId: 'user-it-des',
      endedAt: now,
    });
    expect(firstAuditAfter(audit)).toEqual(expect.objectContaining({ bySubstitute: true }));
  });
});
