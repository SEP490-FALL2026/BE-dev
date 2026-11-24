import { Prisma } from '../../../generated/prisma/client';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { SeatTarget } from '../../catalog/public/catalog.types';
import {
  DeviceActivationAlreadyOnDeviceError,
  DeviceActivationKeyNotAllowedError,
  DeviceActivationKeyNotFoundError,
  DeviceActivationKeyNotOfPlanError,
  DeviceActivationKeyRequiredError,
  DeviceActivationKeyWithdrawnError,
  DeviceActivationLotFullError,
  DeviceActivationPlanNotDeviceBoundError,
  DeviceActivationPlanNotFoundError,
  DeviceActivationPurchaseNotActiveError,
} from '../public/licensing-device-activation.errors';
import type { DeviceActivationRepo } from './device-activation.repo';
import { DeviceActivationService } from './device-activation.service';
import type { ActivationRecord, OpenActivationInput } from './device-activation.types';

interface SetupOptions {
  planTarget?: Partial<SeatTarget> | null;
  lockedTarget?: Partial<SeatTarget> | null;
  keyMeta?: {
    id: string;
    organizationId: string;
    subscriptionId: string;
    planId: string;
    masked: string;
    withdrawnAt: Date | null;
    maxActivations: number;
    initialActivationsUsed: number;
  } | null;
  operationCount?: number;
  occupiedCount?: number;
  insertError?: unknown;
}

describe('DeviceActivationService', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-11-24T10:00:00.000Z');
  const actor = { kind: 'USER' as const, appUserId: 'user-1', employeeId: 'it-1', sessionId: 'sess-1' };

  function makeConstraintError(prismaCode: string, sqlState: string, constraint: string) {
    return new Prisma.PrismaClientKnownRequestError('Constraint refused', {
      code: prismaCode,
      clientVersion: '7.9.1',
      meta: { target: [constraint], driverAdapterError: { cause: { originalCode: sqlState, constraint } } },
    });
  }

  function setup(options: SetupOptions = {}) {
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
            missing: [],
            purchasedQuantity: 5,
            allowsMidTermReduction: false,
            ...options.planTarget,
          };

    const lockedTarget: SeatTarget | null =
      options.lockedTarget === null
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
            missing: [],
            purchasedQuantity: 5,
            allowsMidTermReduction: false,
            ...options.lockedTarget,
          };

    const keyMeta =
      options.keyMeta === undefined
        ? {
            id: 'key-1',
            organizationId: 'org-1',
            subscriptionId: 'sub-1',
            planId: 'plan-1',
            masked: 'AC-01-****',
            withdrawnAt: null,
            maxActivations: 1,
            initialActivationsUsed: 0,
          }
        : options.keyMeta;

    const order: string[] = [];
    const baseRecord: ActivationRecord = {
      id: 'act-1',
      organizationId: 'org-1',
      deviceId: 'dev-1',
      planId: 'plan-1',
      licenseKeyId: planTarget?.keyBinding === 'DEVICE_BUNDLED' ? null : 'key-1',
      subscriptionId: planTarget?.keyBinding === 'DEVICE_BUNDLED' ? null : 'sub-1',
      keyMasked: planTarget?.keyBinding === 'DEVICE_BUNDLED' ? null : 'AC-01-****',
      keyWithdrawn: false,
      origin: 'OPERATION',
      movedFromActivationId: null,
      activatedOn: '2026-11-24',
      activatedAt: now,
      activatedByAppUserId: 'user-1',
      overActivationCap: false,
      deactivatedOn: null,
      deactivatedAt: null,
      endCause: null,
      licenseReleased: null,
      closedByAppUserId: null,
    };

    const repo = {
      findKeyWithMeta: jest.fn().mockResolvedValue(keyMeta),
      lockKeyForShare: jest.fn().mockImplementation(() => {
        order.push('lockKeyForShare');
        return Promise.resolve();
      }),
      countOperationActivationsOfKey: jest.fn().mockResolvedValue(options.operationCount ?? 0),
      occupiedBySubscription: jest.fn().mockResolvedValue(options.occupiedCount ?? 0),
      insert: options.insertError
        ? jest.fn().mockRejectedValue(options.insertError)
        : jest.fn().mockImplementation((_tx: DbTx, data: { overActivationCap: boolean }) =>
            Promise.resolve({
              ...baseRecord,
              overActivationCap: data.overActivationCap,
            }),
          ),
    } as unknown as DeviceActivationRepo;

    const catalog = {
      findPlanSeatTargets: jest.fn().mockResolvedValue(planTarget ? [planTarget] : []),
      lockSeatTarget: jest.fn().mockImplementation(() => {
        order.push('lockSeatTarget');
        return Promise.resolve(lockedTarget);
      }),
    } as unknown as CatalogApi;

    const auditRecord = jest.fn().mockResolvedValue(undefined);
    const audit = { record: auditRecord } as unknown as AuditApi;
    const service = new DeviceActivationService(repo, catalog, audit);

    return { service, repo, catalog, auditRecord, order };
  }

  const input = (over: Partial<OpenActivationInput> = {}): OpenActivationInput => ({
    organizationId: 'org-1',
    deviceId: 'dev-1',
    planId: 'plan-1',
    licenseKeyId: 'key-1',
    origin: 'OPERATION',
    on: '2026-11-24',
    at: now,
    by: actor,
    ...over,
  });

  it('opens a DEVICE_BUNDLED activation without a key and records audit', async () => {
    const { service, repo, catalog, auditRecord } = setup({
      planTarget: { keyBinding: 'DEVICE_BUNDLED', subscriptionId: null },
    });

    const opened = await service.open(tx, input({ licenseKeyId: null }));

    expect(opened).toMatchObject({
      activationsUsed: null,
      maxActivations: null,
      overActivationCap: false,
      activation: { id: 'act-1', licenseKeyId: null },
    });
    expect((catalog as unknown as { lockSeatTarget: jest.Mock }).lockSeatTarget).not.toHaveBeenCalled();
    expect((repo as unknown as { insert: jest.Mock }).insert).toHaveBeenCalledTimes(1);
    expect(auditRecord).toHaveBeenCalledTimes(1);
  });

  it('locks purchase before key for DEVICE_KEY, tracks overActivationCap on OPERATION, and audits bySubstitute', async () => {
    const { service, order, auditRecord } = setup({
      keyMeta: {
        id: 'key-1',
        organizationId: 'org-1',
        subscriptionId: 'sub-1',
        planId: 'plan-1',
        masked: 'AC-01-****',
        withdrawnAt: null,
        maxActivations: 1,
        initialActivationsUsed: 0,
      },
      operationCount: 1,
      occupiedCount: 1,
    });

    const opened = await service.open(tx, input({ by: { ...actor, bySubstitute: true } }));

    expect(order).toEqual(['lockSeatTarget', 'lockKeyForShare']);
    expect(opened).toMatchObject({
      activationsUsed: 2,
      maxActivations: 1,
      overActivationCap: true,
      activation: { overActivationCap: true },
    });
    const calls = auditRecord.mock.calls as Array<[unknown, { after: Record<string, unknown> }]>;
    expect(calls[0][1].after).toMatchObject({ bySubstitute: true, overActivationCap: true });
  });

  it('does not count INITIAL origin toward overActivationCap', async () => {
    const { service, repo } = setup({
      keyMeta: {
        id: 'key-1',
        organizationId: 'org-1',
        subscriptionId: 'sub-1',
        planId: 'plan-1',
        masked: 'AC-01-****',
        withdrawnAt: null,
        maxActivations: 1,
        initialActivationsUsed: 1,
      },
      operationCount: 0,
      occupiedCount: 0,
    });

    const opened = await service.open(tx, input({ origin: 'INITIAL' }));

    expect(opened.overActivationCap).toBe(false);
    expect(opened.activationsUsed).toBe(1);
    expect((repo as unknown as { insert: jest.Mock }).insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ origin: 'INITIAL', overActivationCap: false }),
    );
  });

  it('rejects all invalid open policy preconditions and maps PostgreSQL constraint errors', async () => {
    await expect(setup({ planTarget: null }).service.open(tx, input())).rejects.toBeInstanceOf(
      DeviceActivationPlanNotFoundError,
    );
    await expect(setup({ planTarget: { keyBinding: 'ACCOUNT' } }).service.open(tx, input())).rejects.toBeInstanceOf(
      DeviceActivationPlanNotDeviceBoundError,
    );
    await expect(
      setup({ planTarget: { keyBinding: 'DEVICE_BUNDLED' } }).service.open(tx, input({ licenseKeyId: 'key-1' })),
    ).rejects.toBeInstanceOf(DeviceActivationKeyNotAllowedError);
    await expect(setup().service.open(tx, input({ licenseKeyId: null }))).rejects.toBeInstanceOf(
      DeviceActivationKeyRequiredError,
    );
    await expect(setup({ keyMeta: null }).service.open(tx, input())).rejects.toBeInstanceOf(
      DeviceActivationKeyNotFoundError,
    );
    await expect(
      setup({
        keyMeta: {
          id: 'key-1',
          organizationId: 'org-1',
          subscriptionId: 'sub-other',
          planId: 'plan-other',
          masked: 'X',
          withdrawnAt: null,
          maxActivations: 1,
          initialActivationsUsed: 0,
        },
        lockedTarget: { planId: 'plan-other' },
      }).service.open(tx, input()),
    ).rejects.toBeInstanceOf(DeviceActivationKeyNotOfPlanError);
    await expect(setup({ lockedTarget: { status: 'DRAFT' } }).service.open(tx, input())).rejects.toBeInstanceOf(
      DeviceActivationPurchaseNotActiveError,
    );
    await expect(
      setup({
        keyMeta: {
          id: 'key-1',
          organizationId: 'org-1',
          subscriptionId: 'sub-1',
          planId: 'plan-1',
          masked: 'X',
          withdrawnAt: now,
          maxActivations: 1,
          initialActivationsUsed: 0,
        },
      }).service.open(tx, input()),
    ).rejects.toBeInstanceOf(DeviceActivationKeyWithdrawnError);
    await expect(
      setup({ occupiedCount: 5, lockedTarget: { purchasedQuantity: 5 } }).service.open(tx, input()),
    ).rejects.toBeInstanceOf(DeviceActivationLotFullError);

    await expect(
      setup({ insertError: makeConstraintError('P2002', '23505', 'device_activations_one_open') }).service.open(
        tx,
        input(),
      ),
    ).rejects.toBeInstanceOf(DeviceActivationAlreadyOnDeviceError);
    await expect(
      setup({ insertError: makeConstraintError('P2039', '23514', 'device_activations_lot_capacity') }).service.open(
        tx,
        input(),
      ),
    ).rejects.toBeInstanceOf(DeviceActivationLotFullError);
    await expect(
      setup({ insertError: makeConstraintError('P2039', '23514', 'device_activations_key_usable') }).service.open(
        tx,
        input(),
      ),
    ).rejects.toBeInstanceOf(DeviceActivationKeyWithdrawnError);
  });

  it('openByKey resolves planId from key, leaves activationsUsed unchanged for INITIAL, and enforces lot capacity', async () => {
    const keyInput = (licenseKeyId = 'key-1') => ({
      organizationId: 'org-1',
      deviceId: 'dev-1',
      licenseKeyId,
      origin: 'INITIAL' as const,
      on: '2026-11-24' as const,
      at: now,
      by: actor,
    });
    const { service, catalog, repo } = setup({
      planTarget: { planId: 'plan-1', keyBinding: 'DEVICE_KEY' },
      keyMeta: {
        id: 'key-1',
        organizationId: 'org-1',
        subscriptionId: 'sub-1',
        planId: 'plan-1',
        masked: 'AC-01-****',
        withdrawnAt: null,
        maxActivations: 10,
        initialActivationsUsed: 4,
      },
      operationCount: 2,
      occupiedCount: 3,
      lockedTarget: { purchasedQuantity: 5 },
    });

    const opened = await service.openByKey(tx, keyInput());

    expect((catalog as unknown as { findPlanSeatTargets: jest.Mock }).findPlanSeatTargets).toHaveBeenCalledWith(
      ['plan-1'],
      tx,
    );
    expect(opened).toMatchObject({ activationsUsed: 6, maxActivations: 10, overActivationCap: false });
    expect((repo as unknown as { insert: jest.Mock }).insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ planId: 'plan-1', licenseKeyId: 'key-1', origin: 'INITIAL', overActivationCap: false }),
    );
    await expect(setup({ keyMeta: null }).service.openByKey(tx, keyInput('key-missing'))).rejects.toBeInstanceOf(
      DeviceActivationKeyNotFoundError,
    );
    await expect(
      setup({ planTarget: { applicationStatus: 'RETIRED' } }).service.openByKey(tx, keyInput()),
    ).rejects.toBeInstanceOf(DeviceActivationPlanNotFoundError);
    await expect(
      setup({ planTarget: { keyBinding: 'DEVICE_BUNDLED' } }).service.openByKey(tx, keyInput()),
    ).rejects.toBeInstanceOf(DeviceActivationPlanNotDeviceBoundError);
    await expect(
      setup({ occupiedCount: 5, lockedTarget: { purchasedQuantity: 5 } }).service.openByKey(tx, keyInput()),
    ).rejects.toBeInstanceOf(DeviceActivationLotFullError);
  });
});
