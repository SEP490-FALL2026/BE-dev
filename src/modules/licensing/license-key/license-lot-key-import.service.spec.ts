import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { LicenseLotApi } from '../../catalog/public/license-lot.api';
import type { LicenseLotView } from '../../catalog/public/license-lot.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SeatTargetNotFoundError } from '../public/licensing.errors';
import {
  LicenseKeyApplicationRetiredError,
  LicenseKeyLotKeysExceedLicensesError,
  LicenseKeyLotNotFoundError,
  LicenseKeyLotNotResponsibleError,
  LicenseKeyPlanHasNoKeysError,
} from './license-key.errors';
import { toLicenseKeyApiException } from './license-key.http-errors';
import type { LicenseKeyRepo } from './license-key.repo';
import type { LicenseKeyCipher } from './license-key-cipher.service';
import type { LicenseKeyImportSettingsService } from './license-key-import-settings.service';
import { LicenseLotKeyImportService } from './license-lot-key-import.service';

const tx = { tag: 'tx' };
const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
const actor = {
  appUserId: 'u-it',
  sessionId: 's-1',
  employeeId: 'emp-it',
  roles: ['IT_ADMIN'],
} as unknown as AuthenticatedPrincipal;

function lotOf(changes: Partial<LicenseLotView> = {}): LicenseLotView {
  return {
    id: 'lot-1',
    planId: 'plan-1',
    legacySubscriptionId: null,
    licenseCount: 3,
    keyBinding: 'ACCOUNT',
    purpose: 'REPLACEMENT',
    applicationStatus: 'ACTIVE',
    responsibleItAdminEmployeeId: 'emp-it',
    ...changes,
  } as unknown as LicenseLotView;
}

function setup(held: LicenseLotView | null = lotOf(), usable = 0) {
  const repo = {
    countUsable: jest.fn().mockResolvedValue(usable),
    countAssigned: jest.fn().mockResolvedValue(0),
    deviceOccupiedOf: jest.fn().mockResolvedValue(0),
    insertManyIfNew: jest.fn((_tx: unknown, rows: { id: string; licenseLotId: string; costBorne: boolean }[]) =>
      Promise.resolve(new Set(rows.map((r) => r.id))),
    ),
  };
  const cipher = {
    fingerprint: jest.fn((key: string) => key.padEnd(64, '0')),
    encrypt: jest.fn(() => ({ keyId: 'k1', ciphertext: Buffer.from('x') })),
  };
  const lots = {
    findLot: jest.fn().mockResolvedValue(held),
    lockLot: jest.fn().mockResolvedValue(held),
  };
  const settings = {
    initialActivationsUsed: jest.fn().mockResolvedValue(0),
    maxActivations: jest.fn().mockResolvedValue(1),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const catalog = { findSeatTarget: jest.fn().mockResolvedValue(null), lockSeatTarget: jest.fn() };
  const service = new LicenseLotKeyImportService(
    repo as unknown as LicenseKeyRepo,
    cipher as unknown as LicenseKeyCipher,
    lots as unknown as LicenseLotApi,
    catalog as unknown as CatalogApi,
    settings as unknown as LicenseKeyImportSettingsService,
    { getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }) } as unknown as OrganizationReadApi,
    audit as unknown as AuditApi,
    runner,
  );

  return { service, repo, lots, audit, catalog };
}

describe('LicenseLotKeyImportService (the keys of a lot of licenses)', () => {
  it('keeps the keys in the lot, locked first, bears their cost unless the lot is for a request, and records it on the lot', async () => {
    const { service, repo, lots, audit } = setup();

    const result = await service.import(
      actor,
      'lot-1',
      { keys: ['AAAA-0001', 'BBBB-0002'] },
      { responsibleOnly: true },
    );

    expect(result.imported).toBe(2);
    expect(lots.lockLot).toHaveBeenCalledWith(tx, 'lot-1');
    const rows = repo.insertManyIfNew.mock.calls[0][1] as { licenseLotId: string; costBorne: boolean }[];
    expect(rows.map((r) => [r.licenseLotId, r.costBorne])).toEqual([
      ['lot-1', true],
      ['lot-1', true],
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'LICENSE_KEY.IMPORTED', resourceType: 'LicenseLot', resourceId: 'lot-1' }),
    );
  });

  it('does not bear the cost of a key bought for a request', async () => {
    const { service, repo } = setup(lotOf({ purpose: 'REQUEST' }));

    await service.import(actor, 'lot-1', { keys: ['AAAA-0001'] }, { responsibleOnly: true });

    expect((repo.insertManyIfNew.mock.calls[0][1] as { costBorne: boolean }[])[0].costBorne).toBe(false);
  });

  it('refuses a lot that does not exist, and an IT Admin who does not answer for it on the route of the lot', async () => {
    await expect(
      setup(null).service.import(actor, 'lot-9', { keys: ['AAAA-0001'] }, { responsibleOnly: true }),
    ).rejects.toThrow(LicenseKeyLotNotFoundError);
    await expect(
      setup(lotOf({ responsibleItAdminEmployeeId: 'emp-other' })).service.import(
        actor,
        'lot-1',
        { keys: ['AAAA-0001'] },
        { responsibleOnly: true },
      ),
    ).rejects.toThrow(LicenseKeyLotNotResponsibleError);
  });

  it('requires the responsible IT Admin and a legacy subscription lot when importing via the old route', async () => {
    const notResponsibleErr = await setup(
      lotOf({ legacySubscriptionId: 'lot-1', responsibleItAdminEmployeeId: 'emp-other' }),
    )
      .service.import(actor, 'lot-1', { keys: ['AAAA-0001'] }, { responsibleOnly: true, legacyOnly: true })
      .catch((e: unknown) => e);
    expect(notResponsibleErr).toBeInstanceOf(LicenseKeyLotNotResponsibleError);
    expect(
      (toLicenseKeyApiException(notResponsibleErr) as { getResponse?: () => { code?: string } }).getResponse?.().code,
    ).toBe('LICENSE_LOT.NOT_RESPONSIBLE');

    const notFoundErr = await setup(lotOf({ legacySubscriptionId: null }))
      .service.import(actor, 'lot-1', { keys: ['AAAA-0001'] }, { responsibleOnly: true, legacyOnly: true })
      .catch((e: unknown) => e);
    expect(notFoundErr).toBeInstanceOf(LicenseKeyLotNotFoundError);
    expect(
      (toLicenseKeyApiException(notFoundErr) as { getResponse?: () => { code?: string } }).getResponse?.().code,
    ).toBe('LICENSE_LOT.NOT_FOUND');

    await expect(
      setup(lotOf({ legacySubscriptionId: 'lot-1' })).service.import(
        actor,
        'lot-1',
        { keys: ['AAAA-0001'] },
        { responsibleOnly: true, legacyOnly: true },
      ),
    ).resolves.toMatchObject({
      imported: 1,
    });
  });

  it('refuses more keys than licenses for a plan bound to an account (K-A6), and keeps nothing', async () => {
    const { service, repo } = setup(lotOf(), 2);

    await expect(
      service.import(actor, 'lot-1', { keys: ['AAAA-0001', 'BBBB-0002'] }, { responsibleOnly: true }),
    ).rejects.toThrow(LicenseKeyLotKeysExceedLicensesError);
    expect(repo.insertManyIfNew).not.toHaveBeenCalled();
  });

  it('puts no limit on keys of a plan bound to a machine, and refuses a plan bundled with it or an application that is retired', async () => {
    await expect(
      setup(lotOf({ keyBinding: 'DEVICE_KEY' }), 50).service.import(
        actor,
        'lot-1',
        { keys: ['AAAA-0001'] },
        { responsibleOnly: true },
      ),
    ).resolves.toMatchObject({ imported: 1 });
    await expect(
      setup(lotOf({ keyBinding: 'DEVICE_BUNDLED' })).service.import(
        actor,
        'lot-1',
        { keys: ['AAAA-0001'] },
        { responsibleOnly: true },
      ),
    ).rejects.toThrow(LicenseKeyPlanHasNoKeysError);
    await expect(
      setup(lotOf({ applicationStatus: 'RETIRED' })).service.import(
        actor,
        'lot-1',
        { keys: ['AAAA-0001'] },
        { responsibleOnly: true },
      ),
    ).rejects.toThrow(LicenseKeyApplicationRetiredError);
  });

  it('reads the purchase of a key list from the lot when there is one, else from the subscription of wave 2, else refuses', async () => {
    const withLot = setup(lotOf());
    await expect(withLot.service.purchaseOf('lot-1')).resolves.toEqual({ purchased: 3, keyBinding: 'ACCOUNT' });
    expect(withLot.catalog.findSeatTarget).not.toHaveBeenCalled();

    const old = setup(null);
    old.catalog.findSeatTarget.mockResolvedValue({ purchasedQuantity: 5, keyBinding: 'DEVICE_KEY' });
    await expect(old.service.purchaseOf('sub-1')).resolves.toEqual({ purchased: 5, keyBinding: 'DEVICE_KEY' });

    await expect(setup(null).service.purchaseOf('x')).rejects.toThrow(SeatTargetNotFoundError);
  });

  it('locks the lot of a key before the key, and the subscription only when there is no lot', async () => {
    const withLot = setup(lotOf());
    await withLot.service.lockPurchase(tx as never, 'lot-1');
    expect(withLot.catalog.lockSeatTarget).not.toHaveBeenCalled();

    const old = setup(null);
    await old.service.lockPurchase(tx as never, 'sub-1');
    expect(old.catalog.lockSeatTarget).toHaveBeenCalledWith(tx, { subscriptionId: 'sub-1' });
  });
});
