import { HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { SeatTarget } from '../../catalog/public/catalog.types';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import type { LicensingSeatBaselineApi } from '../../licensing/public/licensing-seat-baseline.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AssetCodeService } from '../asset-code/asset-code.service';
import { DeviceNotInChargeError } from '../public/devices.errors';
import {
  DeviceAssetCodeTakenError,
  DeviceHandoverDateInvalidError,
  DeviceHandoverWithoutHolderError,
  DevicePlanNotBundledError,
} from '../registry/registry.errors';
import type { RegistryRepo } from '../registry/registry.repo';
import { InitialRecordActivationService } from './initial-record-activation.service';
import { DeviceAssetCodeInvalidError, DeviceInitializationClosedError } from './initial-record.errors';
import { toInitialRecordApiException } from './initial-record.http-errors';
import { InitialRecordService } from './initial-record.service';

describe('InitialRecordService (W2-13)', () => {
  const tx = {};
  const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
  const actor = (employeeId = 'it-1') =>
    ({
      appUserId: `user-${employeeId}`,
      employeeId,
      sessionId: 'sess-1',
      roles: ['IT_ADMIN'],
    }) as unknown as AuthenticatedPrincipal;

  function uniqueError(constraint: string) {
    return new Prisma.PrismaClientKnownRequestError(`unique ${constraint}`, {
      code: 'P2002',
      clientVersion: '7.9.1',
      meta: { target: [constraint] },
    });
  }

  function expectHttpError(error: unknown, status: HttpStatus, code: string) {
    const mapped = toInitialRecordApiException(error);
    expect(mapped).toBeInstanceOf(ApiException);
    expect((mapped as ApiException).getStatus()).toBe(status);
    expect((mapped as ApiException).getResponse()).toMatchObject({ code });
  }

  function setup(
    options: {
      initOpen?: boolean;
      today?: string;
      hireDate?: string;
      inCharge?: string | null;
      substitute?: string | null;
      insertDeviceError?: Error;
      bundledTargets?: SeatTarget[];
    } = {},
  ) {
    const order: string[] = [];
    const repo = {
      insertDevice: options.insertDeviceError
        ? jest.fn().mockRejectedValue(options.insertDeviceError)
        : jest.fn().mockImplementation((_tx: unknown, data: Record<string, unknown>) => {
            order.push('insertDevice');
            return Promise.resolve({
              id: 'dev-1',
              organizationId: 'org-1',
              assetCode: data.assetCode,
              hostname: data.hostname,
              os: data.os,
            });
          }),
      insertRegistration: jest.fn().mockImplementation(() => {
        order.push('insertRegistration');
        return Promise.resolve({
          id: 'reg-1',
          organizationId: 'org-1',
          deviceId: 'dev-1',
          holderEmployeeId: 'emp-1',
          validFrom: '2025-03-15',
          validUntil: null,
          endedAt: null,
          endCause: null,
          collectorInstalled: false,
          acknowledgedFrom: null,
          collectionStoppedAt: null,
        });
      }),
    } as unknown as RegistryRepo;

    const actingActors = [
      options.inCharge === undefined ? 'it-1' : options.inCharge,
      options.substitute ?? null,
    ].filter((id): id is string => id !== null);
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      businessToday: jest.fn().mockResolvedValue(options.today ?? '2026-11-24'),
      getEmployee: jest.fn().mockResolvedValue({
        id: 'emp-1',
        status: 'ACTIVE',
        workState: 'WORKING',
        hireDate: options.hireDate ?? '2025-01-01',
      }),
      lockEmployeeForShare: jest.fn().mockImplementation(() => {
        order.push('lockEmployeeForShare');
        return Promise.resolve();
      }),
      workDepartmentsOf: jest.fn().mockResolvedValue(new Map([['emp-1', 'dept-1']])),
      itAdminsActingFor: jest.fn().mockResolvedValue(
        new Map([
          [
            'dept-1',
            {
              inCharge: options.inCharge === undefined ? 'it-1' : options.inCharge,
              substitute: options.substitute ?? null,
              actors: actingActors,
            },
          ],
        ]),
      ),
    } as unknown as OrganizationReadApi;

    const seatBaseline = {
      holdInitializationOpen: jest.fn().mockImplementation(() => {
        order.push('holdInitializationOpen');
        return Promise.resolve(options.initOpen ?? true);
      }),
    } as unknown as LicensingSeatBaselineApi;

    const assetCodes = {
      next: jest.fn().mockImplementation((_tx: unknown, type: string, day: string) => {
        order.push('assetCodeNext');
        return Promise.resolve(`${type}-${day.slice(2, 4)}-0001`);
      }),
    } as unknown as AssetCodeService;

    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(actingActors)),
    } as unknown as IdentityAccessApi;
    const catalog = {
      findPlanSeatTargets: jest.fn().mockResolvedValue(options.bundledTargets ?? []),
    } as unknown as CatalogApi;
    const deviceActivations = {
      open: jest.fn().mockImplementation(() => {
        order.push('openBundled');
        return Promise.resolve({
          activation: { id: 'act-bundled' },
          activationsUsed: null,
          maxActivations: null,
          overActivationCap: false,
        });
      }),
      openByKey: jest.fn().mockImplementation((_tx: unknown, arg: { licenseKeyId: string }) => {
        order.push(`openByKey:${arg.licenseKeyId}`);
        return Promise.resolve({
          activation: { id: `act-${arg.licenseKeyId}` },
          activationsUsed: 1,
          maxActivations: 5,
          overActivationCap: false,
        });
      }),
    } as unknown as LicensingDeviceActivationApi;

    const activations = new InitialRecordActivationService(catalog, deviceActivations);
    const service = new InitialRecordService(
      repo,
      organizationReads,
      audit,
      runner,
      assetCodes,
      identity,
      seatBaseline,
      activations,
    );

    return { service, repo, assetCodes, audit, deviceActivations, order };
  }

  it('rejects closed initialization phase with DeviceInitializationClosedError (409 DEVICE.INITIALIZATION_CLOSED)', async () => {
    const { service } = setup({ initOpen: false });
    const err = await service.create(actor(), { deviceType: 'LAP', hostname: 'H', os: 'Win' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DeviceInitializationClosedError);
    expectHttpError(err, HttpStatus.CONFLICT, 'DEVICE.INITIALIZATION_CLOSED');
  });

  it('rejects invalid legacy asset code (including generated format) with DeviceAssetCodeInvalidError (422 DEVICE.ASSET_CODE_INVALID)', async () => {
    const { service } = setup();
    for (const bad of ['LAP-26-0007', 'bad_code', 'ab']) {
      const err = await service
        .create(actor(), { deviceType: 'LAP', hostname: 'H', os: 'Win', assetCode: bad })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DeviceAssetCodeInvalidError);
      expectHttpError(err, HttpStatus.UNPROCESSABLE_ENTITY, 'DEVICE.ASSET_CODE_INVALID');
    }
  });

  it('rejects handover fields without holder with DeviceHandoverWithoutHolderError (422 DEVICE.HANDOVER_WITHOUT_HOLDER)', async () => {
    const { service } = setup();
    const err = await service
      .create(actor(), { deviceType: 'LAP', hostname: 'H', os: 'Win', handedOverOn: '2025-03-15' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DeviceHandoverWithoutHolderError);
    expectHttpError(err, HttpStatus.UNPROCESSABLE_ENTITY, 'DEVICE.HANDOVER_WITHOUT_HOLDER');
  });

  it('records legacy code with past handedOverOn, enforces lock order, opens bundled + key INITIAL activations, and audits', async () => {
    const bundledTarget: SeatTarget = {
      kind: 'PLAN',
      subscriptionId: null,
      planId: 'plan-b',
      planName: 'Win OEM',
      applicationId: 'app-1',
      applicationName: 'Win OEM',
      applicationKind: 'LICENSED',
      provisioningType: 'K4',
      keyBinding: 'DEVICE_BUNDLED',
      applicationStatus: 'APPROVED',
      status: null,
      purchasedQuantity: null,
      missing: [],
      allowsMidTermReduction: false,
    };
    const { service, repo, assetCodes, audit, deviceActivations, order } = setup({
      bundledTargets: [bundledTarget],
      inCharge: 'it-1',
      substitute: 'it-sub',
    });

    const id = await service.create(actor('it-sub'), {
      deviceType: 'LAP',
      hostname: 'OLD-LT-42',
      os: 'Windows 11',
      assetCode: 'IT-OLD-0042',
      serialNumber: 'SN-42',
      holderEmployeeId: 'emp-1',
      handedOverOn: '2025-03-15',
      bundledPlanIds: ['plan-b'],
      keyActivations: [{ licenseKeyId: 'key-b' }, { licenseKeyId: 'key-a' }],
    });

    expect(id).toBe('dev-1');
    expect((assetCodes as unknown as { next: jest.Mock }).next).not.toHaveBeenCalled();
    expect(order).toEqual([
      'holdInitializationOpen',
      'lockEmployeeForShare',
      'insertDevice',
      'insertRegistration',
      'openBundled',
      'openByKey:key-a',
      'openByKey:key-b',
    ]);
    expect((repo as unknown as { insertDevice: jest.Mock }).insertDevice).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ assetCode: 'IT-OLD-0042', assetCodeOrigin: 'LEGACY' }),
    );
    expect((deviceActivations as unknown as { open: jest.Mock }).open).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ planId: 'plan-b', origin: 'INITIAL', licenseKeyId: null }),
    );
    expect((deviceActivations as unknown as { openByKey: jest.Mock }).openByKey).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ licenseKeyId: 'key-a', origin: 'INITIAL' }),
    );
    const calls = (audit.record as jest.Mock).mock.calls as Array<
      [unknown, { action: string; after: Record<string, unknown> }]
    >;
    expect(calls[0][1].action).toBe('DEVICE.INITIAL_RECORDED');
    expect(calls[0][1].after).toMatchObject({
      assetCode: 'IT-OLD-0042',
      assetCodeOrigin: 'LEGACY',
      validFrom: '2025-03-15',
      collectorInstalled: false,
      bundledPlanIds: ['plan-b'],
      keyActivationIds: ['act-key-a', 'act-key-b'],
      bySubstitute: true,
    });
  });

  it('generates asset code when omitted, enforces H17 (403 DEVICE.NOT_IN_CHARGE), validates hireDate, and maps conflicts', async () => {
    const generated = setup();
    await generated.service.create(actor(), { deviceType: 'PC', hostname: 'PC-1', os: 'Linux' });
    expect(generated.order).toEqual(['holdInitializationOpen', 'assetCodeNext', 'insertDevice']);
    expect((generated.repo as unknown as { insertDevice: jest.Mock }).insertDevice).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ assetCode: 'PC-26-0001', assetCodeOrigin: 'GENERATED' }),
    );

    const notInCharge = await setup({ inCharge: 'it-1' })
      .service.create(actor('it-other'), {
        deviceType: 'LAP',
        hostname: 'H',
        os: 'Win',
        holderEmployeeId: 'emp-1',
      })
      .catch((e: unknown) => e);
    expect(notInCharge).toBeInstanceOf(DeviceNotInChargeError);
    expectHttpError(notInCharge, HttpStatus.FORBIDDEN, 'DEVICE.NOT_IN_CHARGE');

    const beforeHire = await setup({ hireDate: '2026-01-01' })
      .service.create(actor(), {
        deviceType: 'LAP',
        hostname: 'H',
        os: 'Win',
        holderEmployeeId: 'emp-1',
        handedOverOn: '2025-12-31',
      })
      .catch((e: unknown) => e);
    expect(beforeHire).toBeInstanceOf(DeviceHandoverDateInvalidError);
    expectHttpError(beforeHire, HttpStatus.UNPROCESSABLE_ENTITY, 'DEVICE.HANDOVER_DATE_INVALID');

    const taken = await setup({
      insertDeviceError: uniqueError('managed_devices_organization_id_normalized_asset_code_key'),
    })
      .service.create(actor(), { deviceType: 'LAP', hostname: 'H', os: 'Win', assetCode: 'IT-OLD-1' })
      .catch((e: unknown) => e);
    expect(taken).toBeInstanceOf(DeviceAssetCodeTakenError);
    expectHttpError(taken, HttpStatus.CONFLICT, 'DEVICE.ASSET_CODE_TAKEN');

    const nonBundled = await setup({ bundledTargets: [] })
      .service.create(actor(), { deviceType: 'LAP', hostname: 'H', os: 'Win', bundledPlanIds: ['plan-x'] })
      .catch((e: unknown) => e);
    expect(nonBundled).toBeInstanceOf(DevicePlanNotBundledError);
    expectHttpError(nonBundled, HttpStatus.UNPROCESSABLE_ENTITY, 'DEVICE_ACTIVATION.PLAN_NOT_BUNDLED');
  });
});
