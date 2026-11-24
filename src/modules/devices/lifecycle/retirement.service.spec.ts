import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import type { RegistrationEndService } from '../registry/registration-end.service';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import type { DeviceRecord, RegistrationRecord, RegistryRepo } from '../registry/registry.repo';
import { DeviceVoidedError } from './lifecycle.errors';
import { RetirementService } from './retirement.service';

interface SetupOptions {
  device?: Partial<DeviceRecord> | null;
  openRegistration?: Partial<RegistrationRecord> | null;
  inCharge?: string | null;
  substitute?: string | null;
}

describe('RetirementService', () => {
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

    const open: RegistrationRecord | null = options.openRegistration
      ? {
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
        }
      : null;

    const repo = {
      lockDevice: jest.fn().mockResolvedValue(device),
      lockOpenRegistration: jest.fn().mockResolvedValue(open),
      retireDevice: jest.fn().mockResolvedValue(undefined),
    } as unknown as RegistryRepo;
    const ending = { end: jest.fn().mockResolvedValue(undefined) } as unknown as RegistrationEndService;
    const actors = [options.inCharge === undefined ? 'it-1' : options.inCharge, options.substitute ?? null].filter(
      (id): id is string => id !== null,
    );
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      businessToday: jest.fn().mockResolvedValue('2026-11-24'),
      workDepartmentsOf: jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']])),
      itAdminsActingFor: jest.fn().mockResolvedValue(
        new Map([
          [
            'dept-1',
            {
              inCharge: options.inCharge === undefined ? 'it-1' : options.inCharge,
              substitute: options.substitute ?? null,
              actors,
            },
          ],
        ]),
      ),
    } as unknown as OrganizationReadApi;
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(actors)),
    } as unknown as IdentityAccessApi;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;
    const runner = {
      run: jest.fn().mockImplementation((work: (tx: DbTx) => Promise<unknown>) => work(tx)),
    } as unknown as TransactionRunner;

    const service = new RetirementService(repo, ending, organizationReads, identity, audit, runner);

    return { service, repo, ending, audit };
  }

  const firstAuditAfter = (audit: AuditApi): Record<string, unknown> => {
    const calls = (audit.record as jest.Mock).mock.calls as Array<[unknown, { after: Record<string, unknown> }]>;
    return calls[0][1].after;
  };

  it('allows any IT Admin to retire an IN_STOCK machine', async () => {
    const { service, repo, ending, audit } = setup();

    await service.retire(actor('it-other'), 'dev-1', 'Disk failed', now);

    expect((ending as unknown as { end: jest.Mock }).end).not.toHaveBeenCalled();
    expect((repo as unknown as { retireDevice: jest.Mock }).retireDevice).toHaveBeenCalledWith(
      tx,
      'dev-1',
      now,
      'Disk failed',
    );
    expect(firstAuditAfter(audit)).toEqual({ reason: 'Disk failed', endedRegistrationId: null });
  });

  it('enforces acting IT Admin when retiring an ASSIGNED device and audits bySubstitute', async () => {
    const denied = setup({ openRegistration: { holderEmployeeId: 'emp-1' }, inCharge: 'it-1' });
    await expect(denied.service.retire(actor('it-other'), 'dev-1', 'Lost', now)).rejects.toBeInstanceOf(
      DeviceNotInChargeError,
    );

    const bySub = setup({
      openRegistration: { holderEmployeeId: 'emp-1' },
      inCharge: 'it-1',
      substitute: 'it-sub',
    });
    await bySub.service.retire(actor('it-sub'), 'dev-1', 'Disposed', now);

    expect((bySub.ending as unknown as { end: jest.Mock }).end).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'reg-1' }),
      { at: now, cause: 'DEVICE_RETIRED' },
      expect.anything(),
    );
    expect(firstAuditAfter(bySub.audit)).toEqual({
      reason: 'Disposed',
      endedRegistrationId: 'reg-1',
      bySubstitute: true,
    });
  });

  it('rejects missing, voided, or already retired devices', async () => {
    await expect(setup({ device: null }).service.retire(actor(), 'dev-1', 'x', now)).rejects.toBeInstanceOf(
      DeviceNotFoundError,
    );
    await expect(
      setup({ device: { voidedAt: now } }).service.retire(actor(), 'dev-1', 'x', now),
    ).rejects.toBeInstanceOf(DeviceVoidedError);
    await expect(
      setup({ device: { retiredAt: now } }).service.retire(actor(), 'dev-1', 'x', now),
    ).rejects.toBeInstanceOf(DeviceAlreadyRetiredError);
  });
});
