import { HttpStatus } from '@nestjs/common';
import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import { DeviceNotInChargeError } from '../public/devices.errors';
import { CollectorInstallationService } from './collector-installation.service';
import {
  DeviceCollectorAlreadyInstalledError,
  DeviceHolderNotWorkingError,
  DeviceRegistrationEndedError,
  DeviceRegistrationNotFoundError,
} from './registry.errors';
import { toRegistryApiException } from './registry.http-errors';
import type { RegistrationRecord, RegistryRepo } from './registry.repo';

interface SetupOptions {
  registration?: Partial<RegistrationRecord> | null;
  holder?: { id: string; status: string; workState: string; hireDate: string } | null;
  openReturnTask?: { found: boolean; id?: string | null; departmentId: string | null; employeeId?: string | null };
  workDepartmentId?: string | null;
  notStartedIds?: string[];
  inCharge?: string | null;
  substitute?: string | null;
  unplacedDesignee?:
    { kind?: 'DEVICE' | 'DEVICE_RETURN_TASK'; workId?: string; employeeId: string | null } | string | null;
}

describe('CollectorInstallationService', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-11-24T10:00:00.000Z');
  const actor = (employeeId = 'it-1'): AuthenticatedPrincipal =>
    ({ appUserId: `user-${employeeId}`, employeeId, roles: ['IT_ADMIN'] }) as unknown as AuthenticatedPrincipal;

  function setup(options: SetupOptions = {}) {
    const registration: RegistrationRecord | null =
      options.registration === null
        ? null
        : {
            id: 'reg-1',
            organizationId: 'org-1',
            deviceId: 'dev-1',
            holderEmployeeId: 'emp-1',
            validFrom: '2026-11-01',
            validUntil: null,
            endedAt: null,
            endCause: null,
            acknowledgedFrom: null,
            collectionStoppedAt: null,
            collectorInstalled: false,
            ...options.registration,
          };

    const repo = {
      findRegistration: jest.fn().mockResolvedValue(registration),
      lockRegistrationChain: jest.fn().mockResolvedValue(registration),
      findOpenReturnTaskDepartmentId: jest
        .fn()
        .mockResolvedValue(options.openReturnTask ?? { found: false, id: null, departmentId: null, employeeId: null }),
      enableCollector: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegistryRepo;

    const holder =
      options.holder === undefined
        ? { id: 'emp-1', status: 'ACTIVE', workState: 'WORKING', hireDate: '2025-01-01' }
        : options.holder;
    const deptId = options.openReturnTask?.found
      ? options.openReturnTask.departmentId
      : options.workDepartmentId === undefined
        ? 'dept-1'
        : options.workDepartmentId;
    const actors = [options.inCharge === undefined ? 'it-1' : options.inCharge, options.substitute ?? null].filter(
      (id): id is string => id !== null,
    );
    const unplacedEntry =
      options.unplacedDesignee === undefined
        ? null
        : typeof options.unplacedDesignee === 'string' || options.unplacedDesignee === null
          ? {
              kind: 'DEVICE' as const,
              workId: registration?.deviceId ?? 'dev-1',
              employeeId: options.unplacedDesignee,
            }
          : {
              kind: options.unplacedDesignee.kind ?? ('DEVICE' as const),
              workId: options.unplacedDesignee.workId ?? registration?.deviceId ?? 'dev-1',
              employeeId: options.unplacedDesignee.employeeId,
            };

    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      getEmployee: jest.fn().mockResolvedValue(holder),
      lockEmployeeForShare: jest.fn().mockResolvedValue(undefined),
      businessToday: jest.fn().mockResolvedValue('2026-11-24'),
      workDepartmentsOf: jest.fn().mockResolvedValue(deptId ? new Map([['emp-1', deptId]]) : new Map()),
      notStartedAmong: jest.fn().mockResolvedValue(new Set(options.notStartedIds ?? [])),
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
      itAdminsActingForUnplacedWork: jest
        .fn()
        .mockResolvedValue(
          unplacedEntry
            ? new Map([[unplacedWorkKey(unplacedEntry.kind, unplacedEntry.workId), unplacedEntry.employeeId]])
            : new Map(),
        ),
    } as unknown as OrganizationReadApi;
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(actors)),
    } as unknown as IdentityAccessApi;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;
    const runner = {
      run: jest.fn().mockImplementation((work: (tx: DbTx) => Promise<unknown>) => work(tx)),
    } as unknown as TransactionRunner;

    const service = new CollectorInstallationService(repo, organizationReads, identity, audit, runner);

    return { service, repo, audit };
  }

  const firstAuditAfter = (audit: AuditApi): Record<string, unknown> => {
    const calls = (audit.record as jest.Mock).mock.calls as Array<[unknown, { after: Record<string, unknown> }]>;
    return calls[0][1].after;
  };

  it('enables collectorInstalled on an open registration, audits bySubstitute, and returns deviceId', async () => {
    const { service, repo, audit } = setup({ substitute: 'it-sub' });

    const deviceId = await service.enable(actor('it-sub'), 'reg-1', now);

    expect(deviceId).toBe('dev-1');
    expect((repo as unknown as { enableCollector: jest.Mock }).enableCollector).toHaveBeenCalledWith(tx, 'reg-1');
    expect(firstAuditAfter(audit)).toEqual({
      deviceId: 'dev-1',
      collectorInstalled: true,
      bySubstitute: true,
    });
  });

  it('rejects missing, ended, already enabled, non-working holder, and non-acting IT Admin', async () => {
    await expect(setup({ registration: null }).service.enable(actor(), 'reg-1', now)).rejects.toBeInstanceOf(
      DeviceRegistrationNotFoundError,
    );
    await expect(
      setup({ registration: { endedAt: now } }).service.enable(actor(), 'reg-1', now),
    ).rejects.toBeInstanceOf(DeviceRegistrationEndedError);
    await expect(
      setup({ registration: { collectorInstalled: true } }).service.enable(actor(), 'reg-1', now),
    ).rejects.toBeInstanceOf(DeviceCollectorAlreadyInstalledError);
    await expect(
      setup({ holder: { id: 'emp-1', status: 'ACTIVE', workState: 'LEFT', hireDate: '2025-01-01' } }).service.enable(
        actor(),
        'reg-1',
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceHolderNotWorkingError);
    await expect(setup({ inCharge: 'it-1' }).service.enable(actor('it-other'), 'reg-1', now)).rejects.toBeInstanceOf(
      DeviceNotInChargeError,
    );
    await expect(setup({ workDepartmentId: null }).service.enable(actor(), 'reg-1', now)).rejects.toBeInstanceOf(
      DeviceNotInChargeError,
    );
  });

  it('allows designated IT Admin for an unplaced holder device with bySubstitute: true', async () => {
    const { service, audit } = setup({ workDepartmentId: null, unplacedDesignee: 'it-des' });

    const deviceId = await service.enable(actor('it-des'), 'reg-1', now);

    expect(deviceId).toBe('dev-1');
    expect(firstAuditAfter(audit)).toEqual({
      deviceId: 'dev-1',
      collectorInstalled: true,
      bySubstitute: true,
    });
  });

  it('rejects enabling collector for a future-placed holder with EmployeeNotStartedError (409 EMPLOYEE.NOT_STARTED)', async () => {
    const err = await setup({ workDepartmentId: null, notStartedIds: ['emp-1'] })
      .service.enable(actor(), 'reg-1', now)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmployeeNotStartedError);
    const mapped = toRegistryApiException(err) as ApiException;
    expect(mapped.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(mapped.getResponse()).toMatchObject({ code: 'EMPLOYEE.NOT_STARTED' });
  });

  it('authorizes by open return task on AWAITING_RETURN, excluding departing IT Admin while allowing substitute or return-task designee', async () => {
    const deptTask = { found: true, id: 'task-1', departmentId: 'dept-ret', employeeId: 'it-ret' };
    const departingErr = await setup({ openReturnTask: deptTask, inCharge: 'it-ret', substitute: 'it-sub' })
      .service.enable(actor('it-ret'), 'reg-1', now)
      .catch((e: unknown) => e);
    expect(departingErr).toBeInstanceOf(DeviceNotInChargeError);
    expect((toRegistryApiException(departingErr) as ApiException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect((toRegistryApiException(departingErr) as ApiException).getResponse()).toMatchObject({
      code: 'DEVICE.NOT_IN_CHARGE',
    });

    const subOk = setup({ openReturnTask: deptTask, inCharge: 'it-ret', substitute: 'it-sub' });
    await expect(subOk.service.enable(actor('it-sub'), 'reg-1', now)).resolves.toBe('dev-1');
    expect(firstAuditAfter(subOk.audit)).toEqual({
      deviceId: 'dev-1',
      collectorInstalled: true,
      bySubstitute: true,
    });

    const unplacedTask = { found: true, id: 'task-2', departmentId: null, employeeId: 'emp-unplaced' };
    const notStartedErr = await setup({ openReturnTask: unplacedTask, notStartedIds: ['emp-unplaced'] })
      .service.enable(actor('it-des'), 'reg-1', now)
      .catch((e: unknown) => e);
    expect(notStartedErr).toBeInstanceOf(EmployeeNotStartedError);
    expect((toRegistryApiException(notStartedErr) as ApiException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect((toRegistryApiException(notStartedErr) as ApiException).getResponse()).toMatchObject({
      code: 'EMPLOYEE.NOT_STARTED',
    });

    const unplacedOk = setup({
      openReturnTask: unplacedTask,
      unplacedDesignee: { kind: 'DEVICE_RETURN_TASK', workId: 'task-2', employeeId: 'it-des' },
    });
    await expect(unplacedOk.service.enable(actor('it-des'), 'reg-1', now)).resolves.toBe('dev-1');
    expect(firstAuditAfter(unplacedOk.audit)).toEqual({
      deviceId: 'dev-1',
      collectorInstalled: true,
      bySubstitute: true,
    });
  });
});
