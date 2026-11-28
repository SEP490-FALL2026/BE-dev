import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { SeatTarget } from '../../catalog/public/catalog.types';
import type { LicenseLotApi } from '../../catalog/public/license-lot.api';
import type { LicenseLotView } from '../../catalog/public/license-lot.types';
import {
  DeviceActivationAlreadyClosedError,
  DeviceActivationKeyWithdrawnError,
  DeviceActivationNotFoundError,
  DeviceActivationNotMovableError,
  DeviceActivationNotOnDeviceError,
  DeviceActivationPurchaseNotActiveError,
  DeviceActivationReleaseNotApplicableError,
} from '../public/licensing-device-activation.errors';
import { DeviceActivationCloseService } from './device-activation-close.service';
import type { DeviceActivationRepo, KeyActivationMeta } from './device-activation.repo';
import type { ActivationRecord } from './device-activation.types';

/**
 * The lot a purchase of wave 2 is since M6: a perpetual purchase of a K4 plan that is active is a lot of the same id and as many licenses as it bought;
 * a draft (or anything else) is no lot.
 */
function lotOf(target: Partial<SeatTarget> | null): LicenseLotView | null {
  if (!target || target.kind !== 'SUBSCRIPTION' || target.provisioningType !== 'K4' || target.status !== 'ACTIVE')
    return null;

  return { id: target.subscriptionId, licenseCount: target.purchasedQuantity ?? 0 } as unknown as LicenseLotView;
}

describe('DeviceActivationCloseService (W2-20, S-12)', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-11-24T12:00:00.000Z');
  const actor = {
    kind: 'USER' as const,
    appUserId: 'user-1',
    employeeId: 'it-1',
    sessionId: 'sess-1',
    bySubstitute: true,
  };

  function makeActivation(over: Partial<ActivationRecord> = {}): ActivationRecord {
    return {
      id: 'act-1',
      organizationId: 'org-1',
      deviceId: 'dev-1',
      planId: 'plan-1',
      licenseKeyId: 'key-1',
      subscriptionId: 'sub-1',
      keyMasked: 'AC-01-****',
      keyWithdrawn: false,
      origin: 'OPERATION',
      movedFromActivationId: null,
      activatedOn: '2026-11-01',
      activatedAt: new Date('2026-11-01T10:00:00.000Z'),
      activatedByAppUserId: 'user-0',
      overActivationCap: false,
      deactivatedOn: null,
      deactivatedAt: null,
      endCause: null,
      licenseReleased: null,
      closedByAppUserId: null,
      ...over,
    };
  }

  function setup(
    options: {
      locked?: ActivationRecord | null;
      openOfDevice?: ActivationRecord[];
      purchase?: Partial<SeatTarget> | null;
      keyMeta?: Partial<KeyActivationMeta> | null;
      operationCount?: number;
    } = {},
  ) {
    const order: string[] = [];
    const current = options.locked === undefined ? makeActivation() : options.locked;
    const keyMeta: KeyActivationMeta | null =
      options.keyMeta === null
        ? null
        : {
            id: 'key-1',
            organizationId: 'org-1',
            subscriptionId: 'sub-1',
            planId: 'plan-1',
            masked: 'AC-01-****',
            withdrawnAt: null,
            maxActivations: 12,
            initialActivationsUsed: 0,
            ...options.keyMeta,
          };
    const purchase: SeatTarget | null =
      options.purchase === null
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
            ...options.purchase,
          };

    const repo = {
      findById: jest.fn().mockImplementation(() => Promise.resolve(current)),
      openOfDevice: jest
        .fn()
        .mockImplementation(() => Promise.resolve(options.openOfDevice ?? (current ? [current] : []))),
      lockById: jest.fn().mockImplementation(() => Promise.resolve(current)),
      lockOpenOfDevice: jest
        .fn()
        .mockImplementation(() => Promise.resolve(options.openOfDevice ?? (current ? [current] : []))),
      lockKeyForShare: jest.fn().mockImplementation(() => {
        order.push('lockKeyForShare');
        return Promise.resolve();
      }),
      findKeyWithMeta: jest.fn().mockResolvedValue(keyMeta),
      countOperationActivationsOfKey: jest.fn().mockResolvedValue(options.operationCount ?? 12),
      close: jest.fn().mockImplementation((_tx: DbTx, id: string, data: Record<string, unknown>) => {
        order.push(`close:${id}`);
        return Promise.resolve({ ...(current ?? makeActivation()), id, ...data });
      }),
      insert: jest.fn().mockImplementation((_tx: DbTx, data: Record<string, unknown>) => {
        order.push('insert');
        return Promise.resolve(makeActivation({ id: 'act-2', ...data }));
      }),
    } as unknown as DeviceActivationRepo;

    const lots = {
      // The order label is the one of wave 2: the lock a purchase takes first is now the lot's.
      lockLot: jest.fn().mockImplementation(() => {
        order.push('lockSeatTarget');
        return Promise.resolve(lotOf(purchase));
      }),
    } as unknown as LicenseLotApi;

    const auditRecord = jest.fn().mockResolvedValue(undefined);
    const audit = { record: auditRecord } as unknown as AuditApi;
    const service = new DeviceActivationCloseService(repo, lots, audit);

    return { service, repo, lots, auditRecord, order };
  }

  it('closes DEVICE_KEY with default RETURN_TO_LOT and explicit LOST_WITH_DEVICE, and bundled with null release', async () => {
    const returned = setup();
    const res1 = await returned.service.close(tx, {
      activationId: 'act-1',
      cause: 'DEACTIVATED',
      on: '2026-11-24',
      at: now,
      by: actor,
    });
    expect(res1).toMatchObject({ endCause: 'DEACTIVATED', licenseReleased: true });

    const lost = setup();
    const res2 = await lost.service.close(tx, {
      activationId: 'act-1',
      cause: 'DEACTIVATED',
      licenseRelease: 'LOST_WITH_DEVICE',
      on: '2026-11-24',
      at: now,
      by: actor,
    });
    expect(res2).toMatchObject({ endCause: 'DEACTIVATED', licenseReleased: false });

    const bundled = setup({ locked: makeActivation({ licenseKeyId: null, subscriptionId: null, keyMasked: null }) });
    const res3 = await bundled.service.close(tx, {
      activationId: 'act-1',
      cause: 'DEACTIVATED',
      on: '2026-11-24',
      at: now,
      by: actor,
    });
    expect(res3.licenseReleased).toBeNull();

    await expect(
      setup({ locked: null }).service.close(tx, {
        activationId: 'missing',
        cause: 'DEACTIVATED',
        on: '2026-11-24',
        by: actor,
      }),
    ).rejects.toBeInstanceOf(DeviceActivationNotFoundError);
    await expect(
      setup({ locked: makeActivation({ deactivatedAt: now }) }).service.close(tx, {
        activationId: 'act-1',
        cause: 'DEACTIVATED',
        on: '2026-11-24',
        by: actor,
      }),
    ).rejects.toBeInstanceOf(DeviceActivationAlreadyClosedError);
    await expect(
      bundled.service.close(tx, {
        activationId: 'act-1',
        cause: 'DEACTIVATED',
        licenseRelease: 'RETURN_TO_LOT',
        on: '2026-11-24',
        at: now,
        by: actor,
      }),
    ).rejects.toBeInstanceOf(DeviceActivationReleaseNotApplicableError);
  });

  it('moves DEVICE_KEY activation by locking purchase -> key -> closing old MOVED -> inserting new row (S-12)', async () => {
    const { service, order, auditRecord } = setup({ operationCount: 12 });

    const moved = await service.move(tx, {
      activationId: 'act-1',
      targetDeviceId: 'dev-2',
      on: '2026-11-24',
      at: now,
      by: actor,
    });

    expect(order).toEqual(['lockSeatTarget', 'lockKeyForShare', 'close:act-1', 'insert']);
    expect(moved.activationsUsed).toBe(13);
    expect(moved.overActivationCap).toBe(true);
    expect(moved.activation).toMatchObject({
      deviceId: 'dev-2',
      movedFromActivationId: 'act-1',
      licenseKeyId: 'key-1',
    });
    expect(auditRecord).toHaveBeenCalledTimes(1);

    await expect(
      setup({ locked: makeActivation({ licenseKeyId: null, subscriptionId: null }) }).service.move(tx, {
        activationId: 'act-1',
        targetDeviceId: 'dev-2',
        on: '2026-11-24',
        by: actor,
      }),
    ).rejects.toBeInstanceOf(DeviceActivationNotMovableError);
    await expect(
      setup({ locked: makeActivation({ deactivatedAt: now }) }).service.move(tx, {
        activationId: 'act-1',
        targetDeviceId: 'dev-2',
        on: '2026-11-24',
        by: actor,
      }),
    ).rejects.toBeInstanceOf(DeviceActivationAlreadyClosedError);
    await expect(
      setup({ keyMeta: { withdrawnAt: now } }).service.move(tx, {
        activationId: 'act-1',
        targetDeviceId: 'dev-2',
        on: '2026-11-24',
        by: actor,
      }),
    ).rejects.toBeInstanceOf(DeviceActivationKeyWithdrawnError);
    await expect(
      setup({ purchase: { status: 'DRAFT' } }).service.move(tx, {
        activationId: 'act-1',
        targetDeviceId: 'dev-2',
        on: '2026-11-24',
        by: actor,
      }),
    ).rejects.toBeInstanceOf(DeviceActivationPurchaseNotActiveError);
  });

  it('closes all open activations of a device with decision validation', async () => {
    const aKey = makeActivation({ id: 'act-key', subscriptionId: 'sub-2' });
    const aBundled = makeActivation({ id: 'act-oem', licenseKeyId: null, subscriptionId: null });
    const ok = setup({ openOfDevice: [aKey, aBundled] });

    const closed = await ok.service.closeAllOfDevice(tx, {
      deviceId: 'dev-1',
      cause: 'DEVICE_LOST',
      decisions: [{ activationId: 'act-key', licenseRelease: 'LOST_WITH_DEVICE' }],
      on: '2026-11-24',
      at: now,
      by: { kind: 'SYSTEM', correlationId: 'sys-1' },
    });
    expect(closed).toHaveLength(2);

    await expect(
      ok.service.closeAllOfDevice(tx, {
        deviceId: 'dev-1',
        cause: 'DEVICE_DISPOSED',
        decisions: [{ activationId: 'act-other', licenseRelease: 'RETURN_TO_LOT' }],
        on: '2026-11-24',
        by: actor,
      }),
    ).rejects.toBeInstanceOf(DeviceActivationNotOnDeviceError);
    await expect(
      ok.service.closeAllOfDevice(tx, {
        deviceId: 'dev-1',
        cause: 'DEVICE_DISPOSED',
        decisions: [{ activationId: 'act-oem', licenseRelease: 'RETURN_TO_LOT' }],
        on: '2026-11-24',
        by: actor,
      }),
    ).rejects.toBeInstanceOf(DeviceActivationReleaseNotApplicableError);
  });
});
