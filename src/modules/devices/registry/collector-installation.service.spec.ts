import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DeviceNotInChargeError } from '../public/devices.errors';
import { CollectorInstallationService } from './collector-installation.service';
import {
  DeviceCollectorAlreadyInstalledError,
  DeviceHolderNotWorkingError,
  DeviceRegistrationEndedError,
  DeviceRegistrationNotFoundError,
} from './registry.errors';
import type { RegistrationRecord, RegistryRepo } from './registry.repo';

interface SetupOptions {
  registration?: Partial<RegistrationRecord> | null;
  holder?: { id: string; status: string; workState: string; hireDate: string } | null;
  workDepartmentId?: string | null;
  inCharge?: string | null;
  substitute?: string | null;
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
      enableCollector: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegistryRepo;

    const holder =
      options.holder === undefined
        ? { id: 'emp-1', status: 'ACTIVE', workState: 'WORKING', hireDate: '2025-01-01' }
        : options.holder;
    const deptId = options.workDepartmentId === undefined ? 'dept-1' : options.workDepartmentId;
    const actors = [options.inCharge === undefined ? 'it-1' : options.inCharge, options.substitute ?? null].filter(
      (id): id is string => id !== null,
    );

    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      getEmployee: jest.fn().mockResolvedValue(holder),
      lockEmployeeForShare: jest.fn().mockResolvedValue(undefined),
      businessToday: jest.fn().mockResolvedValue('2026-11-24'),
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
});
