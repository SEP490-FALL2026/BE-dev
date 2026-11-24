import { Prisma } from '../../../generated/prisma/client';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AssetCodeService } from '../asset-code/asset-code.service';
import { DeviceNotInChargeError } from '../public/devices.errors';
import { DeviceHandoverWithoutHolderError, DevicePlanNotBundledError, DeviceSerialTakenError } from './registry.errors';
import type { RegistryRepo } from './registry.repo';
import { RegistryService } from './registry.service';

describe('RegistryService device intake (W2-03, H17, org-timezone year)', () => {
  const tx = {};
  const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
  const actor = (employeeId = 'it-1') =>
    ({ appUserId: `user-${employeeId}`, employeeId, roles: ['IT_ADMIN'] }) as unknown as AuthenticatedPrincipal;

  function uniqueError(constraint: string) {
    return new Prisma.PrismaClientKnownRequestError(`unique ${constraint}`, {
      code: 'P2002',
      clientVersion: '7.9.1',
      meta: { target: [constraint] },
    });
  }

  function setup(
    options: {
      today?: string;
      departmentId?: string | null;
      inCharge?: string | null;
      substitute?: string | null;
      insertDeviceError?: Error;
    } = {},
  ) {
    const repo = {
      insertDevice: options.insertDeviceError
        ? jest.fn().mockRejectedValue(options.insertDeviceError)
        : jest.fn().mockImplementation((_tx: unknown, data: Record<string, unknown>) =>
            Promise.resolve({
              id: 'dev-1',
              organizationId: 'org-1',
              assetCode: data.assetCode,
              hostname: data.hostname,
              os: data.os,
              retiredAt: null,
              retirementReason: null,
            }),
          ),
      insertRegistration: jest.fn().mockResolvedValue({
        id: 'reg-1',
        organizationId: 'org-1',
        deviceId: 'dev-1',
        holderEmployeeId: 'emp-1',
        validFrom: options.today ?? '2026-12-31',
        validUntil: null,
        endedAt: null,
        endCause: null,
        collectorInstalled: true,
        acknowledgedFrom: null,
        collectionStoppedAt: null,
      }),
    } as unknown as RegistryRepo;

    const deptId = options.departmentId === undefined ? 'dept-1' : options.departmentId;
    const actingActors = [options.inCharge ?? 'it-1', options.substitute ?? null].filter(
      (id): id is string => id !== null,
    );

    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      businessToday: jest.fn().mockResolvedValue(options.today ?? '2026-12-31'),
      getEmployee: jest.fn().mockResolvedValue({
        id: 'emp-1',
        status: 'ACTIVE',
        workState: 'WORKING',
        hireDate: '2025-01-01',
      }),
      lockEmployeeForShare: jest.fn().mockResolvedValue(undefined),
      workDepartmentsOf: jest.fn().mockResolvedValue(deptId ? new Map([['emp-1', deptId]]) : new Map()),
      itAdminsActingFor: jest.fn().mockResolvedValue(
        deptId
          ? new Map([
              [
                deptId,
                {
                  inCharge: options.inCharge === undefined ? 'it-1' : options.inCharge,
                  substitute: options.substitute ?? null,
                  actors: actingActors,
                },
              ],
            ])
          : new Map(),
      ),
    } as unknown as OrganizationReadApi;

    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(actingActors)),
    } as unknown as IdentityAccessApi;
    const assetCodes = {
      next: jest
        .fn()
        .mockImplementation((_tx: unknown, type: string, day: string) =>
          Promise.resolve(`${type}-${day.slice(2, 4)}-0001`),
        ),
    } as unknown as AssetCodeService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;

    const service = new RegistryService(repo, organizationReads, audit, runner, assetCodes, identity);

    return { service, repo, organizationReads, assetCodes, audit };
  }

  const firstAuditAfter = (audit: AuditApi): Record<string, unknown> => {
    const calls = (audit.record as jest.Mock).mock.calls as Array<[unknown, { after: Record<string, unknown> }]>;
    return calls[0][1].after;
  };

  it('registers an in-stock device with generated asset code using businessToday and audits device details', async () => {
    const { service, repo, assetCodes, audit } = setup({ today: '2026-12-01' });

    const id = await service.create(
      actor('it-any'),
      {
        deviceType: 'LAP',
        hostname: 'DES-LT-07',
        os: 'Windows 11',
        serialNumber: '5CD1234XYZ',
      },
      new Date('2026-12-01T10:00:00.000Z'),
    );

    expect(id).toBe('dev-1');
    expect((assetCodes as unknown as { next: jest.Mock }).next).toHaveBeenCalledWith(tx, 'LAP', '2026-12-01');
    expect((repo as unknown as { insertDevice: jest.Mock }).insertDevice).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        assetCode: 'LAP-26-0001',
        assetCodeOrigin: 'GENERATED',
        deviceType: 'LAP',
        serialNumber: '5CD1234XYZ',
        normalizedSerialNumber: '5cd1234xyz',
      }),
    );
    expect((repo as unknown as { insertRegistration: jest.Mock }).insertRegistration).not.toHaveBeenCalled();
    expect(firstAuditAfter(audit)).toMatchObject({
      assetCode: 'LAP-26-0001',
      deviceType: 'LAP',
      serialNumber: '5CD1234XYZ',
      bundledPlanIds: [],
    });
  });

  it('passes organization businessToday on Dec 31 UTC boundary so org timezone decides asset code year', async () => {
    const dec31 = setup({ today: '2026-12-31' });
    const utcMomentDec31Local = new Date('2026-12-31T16:59:59.000Z');
    await dec31.service.create(actor(), { deviceType: 'LAP', hostname: 'H1', os: 'Linux' }, utcMomentDec31Local);
    expect((dec31.organizationReads as unknown as { businessToday: jest.Mock }).businessToday).toHaveBeenCalledWith(
      utcMomentDec31Local,
      tx,
    );
    expect((dec31.assetCodes as unknown as { next: jest.Mock }).next).toHaveBeenCalledWith(tx, 'LAP', '2026-12-31');

    const jan1 = setup({ today: '2027-01-01' });
    const utcMomentJan1Local = new Date('2026-12-31T17:00:00.000Z');
    await jan1.service.create(actor(), { deviceType: 'LAP', hostname: 'H2', os: 'Linux' }, utcMomentJan1Local);
    expect((jan1.assetCodes as unknown as { next: jest.Mock }).next).toHaveBeenCalledWith(tx, 'LAP', '2027-01-01');
  });

  it('rejects handedOverOn or collectorInstalled when holderEmployeeId is omitted', async () => {
    const { service } = setup();

    await expect(
      service.create(actor(), { deviceType: 'LAP', hostname: 'H', os: 'OS', handedOverOn: '2026-11-24' }),
    ).rejects.toBeInstanceOf(DeviceHandoverWithoutHolderError);
    await expect(
      service.create(actor(), { deviceType: 'LAP', hostname: 'H', os: 'OS', collectorInstalled: true }),
    ).rejects.toBeInstanceOf(DeviceHandoverWithoutHolderError);
  });

  it('rejects non-empty bundledPlanIds until bundled activation wiring lands', async () => {
    const { service } = setup();

    await expect(
      service.create(actor(), { deviceType: 'LAP', hostname: 'H', os: 'OS', bundledPlanIds: ['plan-1'] }),
    ).rejects.toBeInstanceOf(DevicePlanNotBundledError);
  });

  it('maps duplicate normalized_serial_number unique violations to DeviceSerialTakenError', async () => {
    const { service } = setup({
      insertDeviceError: uniqueError('managed_devices_organization_id_normalized_serial_number_key'),
    });

    await expect(
      service.create(actor(), { deviceType: 'LAP', hostname: 'H', os: 'OS', serialNumber: 'SN-1' }),
    ).rejects.toBeInstanceOf(DeviceSerialTakenError);
  });

  it('enforces H17 acting IT Admin when holderEmployeeId is given and audits bySubstitute when substitute acts', async () => {
    const nonActing = setup({ inCharge: 'it-1', substitute: 'it-sub' });
    await expect(
      nonActing.service.create(actor('it-other'), {
        deviceType: 'LAP',
        hostname: 'H',
        os: 'OS',
        holderEmployeeId: 'emp-1',
        collectorInstalled: false,
      }),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);

    const unplaced = setup({ departmentId: null });
    await expect(
      unplaced.service.create(actor('it-1'), {
        deviceType: 'LAP',
        hostname: 'H',
        os: 'OS',
        holderEmployeeId: 'emp-1',
      }),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);

    const bySub = setup({ inCharge: 'it-1', substitute: 'it-sub' });
    await bySub.service.create(actor('it-sub'), {
      deviceType: 'LAP',
      hostname: 'H',
      os: 'OS',
      holderEmployeeId: 'emp-1',
      collectorInstalled: true,
    });
    expect(firstAuditAfter(bySub.audit)).toMatchObject({
      holderEmployeeId: 'emp-1',
      collectorInstalled: true,
      bySubstitute: true,
    });
  });
});
