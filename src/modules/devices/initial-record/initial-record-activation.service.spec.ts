import { HttpStatus } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { SeatTarget } from '../../catalog/public/catalog.types';
import type { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import { DeviceActivationKeyNotFoundError } from '../../licensing/public/licensing-device-activation.errors';
import { DevicePlanNotBundledError } from '../registry/registry.errors';
import { InitialRecordActivationService } from './initial-record-activation.service';
import { toInitialRecordApiException } from './initial-record.http-errors';

describe('InitialRecordActivationService', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-11-24T10:00:00.000Z');
  const actor = {
    appUserId: 'user-it-1',
    employeeId: 'it-1',
    sessionId: 'sess-1',
    roles: ['IT_ADMIN'],
  } as unknown as AuthenticatedPrincipal;

  function expectHttpError(error: unknown, status: HttpStatus, code: string) {
    const mapped = toInitialRecordApiException(error);
    expect(mapped).toBeInstanceOf(ApiException);
    expect((mapped as ApiException).getStatus()).toBe(status);
    expect((mapped as ApiException).getResponse()).toMatchObject({ code });
  }

  function setup(
    options: {
      bundledTargets?: SeatTarget[];
      keySubscriptions?: Record<string, string>;
      missingKeys?: string[];
    } = {},
  ) {
    const order: string[] = [];
    const missing = new Set(options.missingKeys ?? []);
    const subMap = new Map(Object.entries(options.keySubscriptions ?? {}));

    const catalog = {
      findPlanSeatTargets: jest.fn().mockResolvedValue(options.bundledTargets ?? []),
    } as unknown as CatalogApi;

    const deviceActivations = {
      keySubscriptionIds: jest.fn().mockImplementation((ids: readonly string[]) => {
        order.push(`keySubscriptionIds:${ids.join(',')}`);
        return Promise.resolve(new Map(ids.flatMap((id) => (subMap.has(id) ? [[id, subMap.get(id)!]] : []))));
      }),
      open: jest.fn().mockImplementation((_tx: DbTx, arg: { planId: string }) => {
        order.push(`openBundled:${arg.planId}`);
        return Promise.resolve({ activation: { id: `act-${arg.planId}` } });
      }),
      openByKey: jest.fn().mockImplementation((_tx: DbTx, arg: { licenseKeyId: string }) => {
        order.push(`openByKey:${arg.licenseKeyId}`);
        if (missing.has(arg.licenseKeyId)) return Promise.reject(new DeviceActivationKeyNotFoundError());
        return Promise.resolve({ activation: { id: `act-${arg.licenseKeyId}` } });
      }),
    } as unknown as LicensingDeviceActivationApi;

    const service = new InitialRecordActivationService(catalog, deviceActivations);

    return { service, deviceActivations, order };
  }

  it('orders openByKey by subscriptionId ASC before licenseKeyId ASC when keyA < keyB but sub(keyA) > sub(keyB)', async () => {
    const keyA = '00000000-0000-0000-0000-00000000000a';
    const keyB = '00000000-0000-0000-0000-00000000000b';
    const { service, order } = setup({
      keySubscriptions: {
        [keyA]: 'sub-2',
        [keyB]: 'sub-1',
      },
    });

    const ids = await service.openInitial(tx, actor, 'org-1', 'dev-1', {
      bundledPlanIds: [],
      licenseKeyIds: [keyA, keyB],
      on: '2026-11-24',
      at: now,
      bySubstitute: false,
    });

    expect(order).toEqual([`keySubscriptionIds:${keyA},${keyB}`, `openByKey:${keyB}`, `openByKey:${keyA}`]);
    expect(ids).toEqual([`act-${keyB}`, `act-${keyA}`]);
  });

  it('orders openByKey by licenseKeyId ASC within the same subscriptionId and deduplicates', async () => {
    const { service, order } = setup({
      keySubscriptions: {
        'key-a': 'sub-1',
        'key-b': 'sub-1',
        'key-c': 'sub-0',
      },
    });

    const ids = await service.openInitial(tx, actor, 'org-1', 'dev-1', {
      bundledPlanIds: [],
      licenseKeyIds: ['key-b', 'key-a', 'key-b', 'key-c'],
      on: '2026-11-24',
      at: now,
      bySubstitute: true,
    });

    expect(order).toEqual([
      'keySubscriptionIds:key-b,key-a,key-c',
      'openByKey:key-c',
      'openByKey:key-a',
      'openByKey:key-b',
    ]);
    expect(ids).toEqual(['act-key-c', 'act-key-a', 'act-key-b']);
  });

  it('skips lookup for zero or one key and preserves bundled/key error codes', async () => {
    const single = setup();
    const singleIds = await single.service.openInitial(tx, actor, 'org-1', 'dev-1', {
      bundledPlanIds: [],
      licenseKeyIds: ['key-1'],
      on: '2026-11-24',
      at: now,
      bySubstitute: false,
    });
    expect(singleIds).toEqual(['act-key-1']);
    expect(single.order).toEqual(['openByKey:key-1']);

    const nonBundled = setup({ bundledTargets: [] });
    const bundledErr = await nonBundled.service
      .openInitial(tx, actor, 'org-1', 'dev-1', {
        bundledPlanIds: ['plan-bad'],
        licenseKeyIds: ['key-1', 'key-2'],
        on: '2026-11-24',
        at: now,
        bySubstitute: false,
      })
      .catch((e: unknown) => e);
    expect(bundledErr).toBeInstanceOf(DevicePlanNotBundledError);
    expectHttpError(bundledErr, HttpStatus.UNPROCESSABLE_ENTITY, 'DEVICE_ACTIVATION.PLAN_NOT_BUNDLED');
    expect(nonBundled.order).toEqual([]);

    const missingKey = setup({
      keySubscriptions: { 'key-2': 'sub-1' },
      missingKeys: ['key-missing'],
    });
    const keyErr = await missingKey.service
      .openInitial(tx, actor, 'org-1', 'dev-1', {
        bundledPlanIds: [],
        licenseKeyIds: ['key-2', 'key-missing'],
        on: '2026-11-24',
        at: now,
        bySubstitute: false,
      })
      .catch((e: unknown) => e);
    expect(keyErr).toBeInstanceOf(DeviceActivationKeyNotFoundError);
    expectHttpError(keyErr, HttpStatus.UNPROCESSABLE_ENTITY, 'DEVICE_ACTIVATION.KEY_NOT_FOUND');
    expect(missingKey.order).toEqual(['keySubscriptionIds:key-2,key-missing', 'openByKey:key-missing']);
  });
});
