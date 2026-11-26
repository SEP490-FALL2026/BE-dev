import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { LicenseLotApi } from '../../catalog/public/license-lot.api';
import type { LicenseLotView } from '../../catalog/public/license-lot.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { LicenseKeyCipher } from './license-key-cipher.service';
import type { LicenseKeyImportSettingsService } from './license-key-import-settings.service';
import { LicenseKeyLotNotFoundError, LicenseKeyLotNotResponsibleError } from './license-key.errors';
import { toLicenseKeyApiException } from './license-key.http-errors';
import type { LicenseKeyRepo } from './license-key.repo';
import { LicenseKeyService } from './license-key.service';
import type { LicenseKeyRevealQuotaRepo } from './license-key-reveal-quota.repo';
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
    legacySubscriptionId: 'lot-1',
    licenseCount: 3,
    keyBinding: 'ACCOUNT',
    purpose: 'OPENING',
    applicationStatus: 'APPROVED',
    responsibleItAdminEmployeeId: 'emp-it',
    ...changes,
  } as unknown as LicenseLotView;
}

function setup(held: LicenseLotView | null = lotOf()) {
  const repo = {
    countUsable: jest.fn().mockResolvedValue(0),
    countAssigned: jest.fn().mockResolvedValue(0),
    deviceOccupiedOf: jest.fn().mockResolvedValue(0),
    insertManyIfNew: jest.fn((_tx: unknown, rows: { id: string }[]) => Promise.resolve(new Set(rows.map((r) => r.id)))),
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
  const organizationReads = { getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const catalog = { findSeatTarget: jest.fn().mockResolvedValue(null), lockSeatTarget: jest.fn() };
  const lotKeys = new LicenseLotKeyImportService(
    repo as unknown as LicenseKeyRepo,
    cipher as unknown as LicenseKeyCipher,
    lots as unknown as LicenseLotApi,
    catalog as unknown as CatalogApi,
    settings as unknown as LicenseKeyImportSettingsService,
    organizationReads as unknown as OrganizationReadApi,
    audit as unknown as AuditApi,
    runner,
  );
  const service = new LicenseKeyService(
    repo as unknown as LicenseKeyRepo,
    {} as unknown as LicenseKeyRevealQuotaRepo,
    cipher as unknown as LicenseKeyCipher,
    catalog as unknown as CatalogApi,
    lotKeys,
    organizationReads as unknown as OrganizationReadApi,
    audit as unknown as AuditApi,
    runner,
  );

  return { service };
}

async function expectErrorCode(
  promise: Promise<unknown>,
  ErrorClass: new (...args: never[]) => Error,
  status: number,
  code: string,
) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ErrorClass);
  const mapped = toLicenseKeyApiException(caught) as {
    getStatus?: () => number;
    getResponse?: () => { code?: string };
  };
  expect(mapped.getStatus?.()).toBe(status);
  expect(mapped.getResponse?.().code).toBe(code);
}

describe('LicenseKeyService.import (legacy import route)', () => {
  it('refuses a non-responsible IT Admin with LICENSE_LOT.NOT_RESPONSIBLE', async () => {
    const { service } = setup(lotOf({ responsibleItAdminEmployeeId: 'emp-other' }));

    await expectErrorCode(
      service.import(actor, { subscriptionId: 'lot-1', keys: ['AAAA-0001'] }),
      LicenseKeyLotNotResponsibleError,
      403,
      'LICENSE_LOT.NOT_RESPONSIBLE',
    );
  });

  it('refuses a new lot without legacySubscriptionId matching the id with LICENSE_LOT.NOT_FOUND', async () => {
    const { service } = setup(lotOf({ legacySubscriptionId: null }));

    await expectErrorCode(
      service.import(actor, { subscriptionId: 'lot-1', keys: ['AAAA-0001'] }),
      LicenseKeyLotNotFoundError,
      404,
      'LICENSE_LOT.NOT_FOUND',
    );
  });

  it('imports keys when the caller is the responsible IT Admin and legacySubscriptionId matches the id', async () => {
    const { service } = setup(lotOf({ legacySubscriptionId: 'lot-1', responsibleItAdminEmployeeId: 'emp-it' }));

    await expect(service.import(actor, { subscriptionId: 'lot-1', keys: ['AAAA-0001'] })).resolves.toMatchObject({
      imported: 1,
    });
  });
});
