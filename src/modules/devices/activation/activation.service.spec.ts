import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { SeatTarget } from '../../catalog/public/catalog.types';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import {
  DeviceActivationNotFoundError,
  DeviceActivationPlanNotDeviceBoundError,
  DeviceActivationPlanNotFoundError,
} from '../../licensing/public/licensing-device-activation.errors';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { DeviceCondition } from '../devices-custody.policy';
import {
  DeviceAwaitingReturnError,
  DeviceNotUsableError,
  DeviceSameDeviceError,
  DeviceVoidedError,
} from '../lifecycle/lifecycle.errors';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import type { DeviceRecord, RegistrationRecord, RegistryRepo } from '../registry/registry.repo';
import { DeviceActivationCommandService } from './activation.service';

interface SetupOptions {
  device?: Partial<DeviceRecord> | null;
  targetDevice?: Partial<DeviceRecord> | null;
  open?: Partial<RegistrationRecord> | null;
  targetOpen?: Partial<RegistrationRecord> | null;
  returnTask?: { found: boolean; departmentId: string | null };
  targetReturnTask?: { found: boolean; departmentId: string | null };
  foundActivation?: {
    id: string;
    deviceId: string;
    planId: string;
    licenseKeyId: string | null;
    subscriptionId: string | null;
  } | null;
  planTarget?: Partial<SeatTarget> | null;
  inCharge?: string | null;
  substitute?: string | null;
  departmentId?: string | null;
}

describe('DeviceActivationCommandService (W2-19, H17)', () => {
  const tx = {};
  const now = new Date('2026-11-24T10:00:00.000Z');
  const today = '2026-11-24';
  const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
  const actor = (employeeId = 'it-1') =>
    ({
      appUserId: `user-${employeeId}`,
      employeeId,
      sessionId: 'sess-1',
      roles: ['IT_ADMIN'],
    }) as unknown as AuthenticatedPrincipal;

  function setup(options: SetupOptions = {}) {
    const order: string[] = [];
    const device: DeviceRecord | null =
      options.device === null
        ? null
        : {
            id: 'dev-1',
            organizationId: 'org-1',
            assetCode: 'LAP-26-0001',
            hostname: 'H1',
            os: 'Windows 11',
            condition: 'USABLE' as DeviceCondition,
            conditionNote: null,
            retiredAt: null,
            retirementReason: null,
            retirementKind: null,
            voidedAt: null,
            ...options.device,
          };

    const open: RegistrationRecord | null =
      options.open === null || options.open === undefined
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
            collectorInstalled: true,
            acknowledgedFrom: null,
            collectionStoppedAt: null,
            ...options.open,
          };

    const returnTask = options.returnTask ?? { found: false, departmentId: null };
    const planTarget: SeatTarget | null =
      options.planTarget === null
        ? null
        : {
            kind: 'SUBSCRIPTION',
            subscriptionId: 'sub-1',
            planId: 'plan-1',
            planName: 'AutoCAD',
            applicationId: 'app-1',
            applicationName: 'AutoCAD',
            applicationKind: 'LICENSED',
            provisioningType: 'K4',
            keyBinding: 'DEVICE_KEY',
            applicationStatus: 'APPROVED',
            status: 'ACTIVE',
            purchasedQuantity: 2,
            missing: [],
            allowsMidTermReduction: false,
            ...options.planTarget,
          };

    const targetDevice: DeviceRecord | null =
      options.targetDevice === null
        ? null
        : {
            id: 'dev-2',
            organizationId: 'org-1',
            assetCode: 'LAP-26-0002',
            hostname: 'H2',
            os: 'Windows 11',
            condition: 'USABLE' as DeviceCondition,
            conditionNote: null,
            retiredAt: null,
            retirementReason: null,
            retirementKind: null,
            voidedAt: null,
            ...options.targetDevice,
          };

    const repo = {
      lockDevice: jest.fn().mockImplementation((_t: unknown, id: string) => {
        order.push('lockDevice');
        return Promise.resolve(id === 'dev-2' ? targetDevice : device);
      }),
      lockDevices: jest.fn().mockImplementation((_t: unknown, ids: string[]) => {
        order.push(`lockDevices:${[...ids].sort().join(',')}`);
        const list: DeviceRecord[] = [];
        if (device && ids.includes(device.id)) list.push(device);
        if (targetDevice && ids.includes(targetDevice.id)) list.push(targetDevice);
        return Promise.resolve(list);
      }),
      lockOpenRegistration: jest.fn().mockImplementation((_t: unknown, id: string) => {
        order.push('lockOpenRegistration');
        if (id === 'dev-2') {
          return Promise.resolve(
            options.targetOpen ? { ...open, id: 'reg-2', deviceId: 'dev-2', ...options.targetOpen } : null,
          );
        }
        return Promise.resolve(open);
      }),
      findOpenReturnTaskDepartmentId: jest
        .fn()
        .mockImplementation((_t: unknown, id: string) =>
          Promise.resolve(
            id === 'dev-2' ? (options.targetReturnTask ?? { found: false, departmentId: null }) : returnTask,
          ),
        ),
    } as unknown as RegistryRepo;

    const deptId = options.departmentId === undefined ? 'dept-1' : options.departmentId;
    const actingActors = [options.inCharge ?? 'it-1', options.substitute ?? null].filter(
      (id): id is string => id !== null,
    );
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue(today),
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

    const catalog = {
      findPlanSeatTargets: jest.fn().mockImplementation(() => {
        order.push('findPlanSeatTargets');
        return Promise.resolve(planTarget ? [planTarget] : []);
      }),
    } as unknown as CatalogApi;

    const openedResult = {
      activation: {
        id: 'act-1',
        organizationId: 'org-1',
        deviceId: 'dev-1',
        planId: 'plan-1',
        licenseKeyId: 'key-1',
        subscriptionId: 'sub-1',
        keyMasked: 'AC-01-****',
        keyWithdrawn: false,
        origin: 'OPERATION' as const,
        movedFromActivationId: null,
        activatedOn: today,
        activatedAt: now,
        activatedByAppUserId: 'user-it-1',
        overActivationCap: false,
        deactivatedOn: null,
        deactivatedAt: null,
        endCause: null,
        licenseReleased: null,
        closedByAppUserId: null,
      },
      activationsUsed: 1,
      maxActivations: 1,
      overActivationCap: false,
    };

    const foundActivation =
      options.foundActivation === undefined
        ? openedResult.activation
        : options.foundActivation
          ? { ...openedResult.activation, ...options.foundActivation }
          : null;

    const deviceActivations = {
      open: jest.fn().mockImplementation(() => {
        order.push('deviceActivations.open');
        return Promise.resolve(openedResult);
      }),
      find: jest.fn().mockResolvedValue(foundActivation),
      close: jest.fn().mockImplementation(() => {
        order.push('deviceActivations.close');
        return Promise.resolve(foundActivation);
      }),
      move: jest.fn().mockImplementation(() => {
        order.push('deviceActivations.move');
        return Promise.resolve(openedResult);
      }),
    } as unknown as LicensingDeviceActivationApi;

    const service = new DeviceActivationCommandService(
      repo,
      organizationReads,
      identity,
      catalog,
      deviceActivations,
      runner,
    );

    return { service, order, deviceActivations, openedResult };
  }

  it('allows any IT Admin to open DEVICE_BUNDLED activation on an IN_STOCK USABLE machine', async () => {
    const { service, order, deviceActivations, openedResult } = setup({
      planTarget: { keyBinding: 'DEVICE_BUNDLED', subscriptionId: null, status: null, purchasedQuantity: null },
    });

    const result = await service.open(actor('it-any'), 'dev-1', { planId: 'plan-1' }, now);

    expect(result).toBe(openedResult);
    expect(order).toEqual(['lockDevice', 'lockOpenRegistration', 'findPlanSeatTargets', 'deviceActivations.open']);
    expect((deviceActivations as unknown as { open: jest.Mock }).open).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      deviceId: 'dev-1',
      planId: 'plan-1',
      licenseKeyId: null,
      origin: 'OPERATION',
      on: today,
      at: now,
      by: {
        kind: 'USER',
        appUserId: 'user-it-any',
        employeeId: 'it-any',
        sessionId: 'sess-1',
        bySubstitute: false,
      },
    });
  });

  it('enforces H17 in-charge check on ASSIGNED devices and passes bySubstitute when substitute acts', async () => {
    const { service } = setup({ open: {}, inCharge: 'it-1', substitute: 'it-sub' });
    await expect(
      service.open(actor('it-other'), 'dev-1', { planId: 'plan-1', licenseKeyId: 'key-1' }, now),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);

    const sub = setup({ open: {}, inCharge: 'it-1', substitute: 'it-sub' });
    await sub.service.open(actor('it-sub'), 'dev-1', { planId: 'plan-1', licenseKeyId: 'key-1' }, now);
    const openCalls = (sub.deviceActivations as unknown as { open: jest.Mock }).open.mock.calls as Array<
      [unknown, { by: { employeeId: string; bySubstitute: boolean } }]
    >;
    expect(openCalls[0][1].by).toMatchObject({ employeeId: 'it-sub', bySubstitute: true });
  });

  it('rejects VOIDED, RETIRED, NOT_USABLE (even for DEVICE_BUNDLED), and AWAITING_RETURN (for DEVICE_KEY)', async () => {
    await expect(
      setup({ device: null }).service.open(actor(), 'dev-1', { planId: 'plan-1' }, now),
    ).rejects.toBeInstanceOf(DeviceNotFoundError);
    await expect(
      setup({ device: { voidedAt: now } }).service.open(actor(), 'dev-1', { planId: 'plan-1' }, now),
    ).rejects.toBeInstanceOf(DeviceVoidedError);
    await expect(
      setup({ device: { retiredAt: now } }).service.open(actor(), 'dev-1', { planId: 'plan-1' }, now),
    ).rejects.toBeInstanceOf(DeviceAlreadyRetiredError);
    await expect(
      setup({
        device: { condition: 'BROKEN' },
        planTarget: { keyBinding: 'DEVICE_BUNDLED', subscriptionId: null, status: null, purchasedQuantity: null },
      }).service.open(actor(), 'dev-1', { planId: 'plan-1' }, now),
    ).rejects.toBeInstanceOf(DeviceNotUsableError);
    await expect(
      setup({
        device: { condition: 'IN_REPAIR' },
        planTarget: { keyBinding: 'DEVICE_BUNDLED', subscriptionId: null, status: null, purchasedQuantity: null },
      }).service.open(actor(), 'dev-1', { planId: 'plan-1' }, now),
    ).rejects.toBeInstanceOf(DeviceNotUsableError);
    await expect(
      setup({
        returnTask: { found: true, departmentId: 'dept-1' },
        planTarget: { keyBinding: 'DEVICE_KEY' },
      }).service.open(actor('it-1'), 'dev-1', { planId: 'plan-1', licenseKeyId: 'key-1' }, now),
    ).rejects.toBeInstanceOf(DeviceAwaitingReturnError);
  });

  it('rejects unknown or non-device-bound plans before opening activation', async () => {
    await expect(
      setup({ planTarget: null }).service.open(actor(), 'dev-1', { planId: 'plan-1' }, now),
    ).rejects.toBeInstanceOf(DeviceActivationPlanNotFoundError);
    await expect(
      setup({ planTarget: { keyBinding: 'ACCOUNT' } }).service.open(actor(), 'dev-1', { planId: 'plan-1' }, now),
    ).rejects.toBeInstanceOf(DeviceActivationPlanNotDeviceBoundError);
  });

  it('deactivates activations with H17 enforcement on assigned devices and 404 when missing', async () => {
    await expect(
      setup({ foundActivation: null }).service.deactivate(actor(), 'missing', {}, now),
    ).rejects.toBeInstanceOf(DeviceActivationNotFoundError);

    const assigned = setup({ open: {}, inCharge: 'it-1' });
    await expect(assigned.service.deactivate(actor('it-other'), 'act-1', {}, now)).rejects.toBeInstanceOf(
      DeviceNotInChargeError,
    );

    assigned.order.length = 0;
    const closed = await assigned.service.deactivate(
      actor('it-1'),
      'act-1',
      { licenseRelease: 'LOST_WITH_DEVICE' },
      now,
    );
    expect(closed).toBeDefined();
    expect(assigned.order).toEqual(['lockDevice', 'lockOpenRegistration', 'deviceActivations.close']);
  });

  it('moves activation after locking both devices in one sorted call, checking H17 and target readiness', async () => {
    await expect(
      setup({
        foundActivation: {
          id: 'act-1',
          deviceId: 'dev-1',
          planId: 'plan-1',
          licenseKeyId: 'key-1',
          subscriptionId: 'sub-1',
        },
      }).service.move(actor(), 'act-1', { targetDeviceId: 'dev-1' }, now),
    ).rejects.toBeInstanceOf(DeviceSameDeviceError);

    const { service, order } = setup();
    await service.move(actor('it-any'), 'act-1', { targetDeviceId: 'dev-2' }, now);
    expect(order[0]).toBe('lockDevices:dev-1,dev-2');
    expect(order[order.length - 1]).toBe('deviceActivations.move');

    await expect(
      setup({ open: {}, inCharge: 'it-1' }).service.move(actor('it-other'), 'act-1', { targetDeviceId: 'dev-2' }, now),
    ).rejects.toBeInstanceOf(DeviceNotInChargeError);

    await expect(
      setup({ targetDevice: { condition: 'BROKEN' } }).service.move(actor(), 'act-1', { targetDeviceId: 'dev-2' }, now),
    ).rejects.toBeInstanceOf(DeviceNotUsableError);

    await expect(
      setup({ targetReturnTask: { found: true, departmentId: 'dept-1' } }).service.move(
        actor('it-1'),
        'act-1',
        { targetDeviceId: 'dev-2' },
        now,
      ),
    ).rejects.toBeInstanceOf(DeviceAwaitingReturnError);
  });
});
