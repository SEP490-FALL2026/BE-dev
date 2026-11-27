import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { SeatOccupancyHook } from '../public/catalog.extension-points';
import { LicenseLotPriceLockedError } from './license-lot.errors';
import { toLicenseLotApiException } from './license-lot.http-errors';
import type { LicenseLotRepo } from './license-lot.repo';
import type { LicenseLotPriceService } from './license-lot-price.service';
import type { LicenseLotRecord } from './license-lot.types';
import { LicenseLotService } from './license-lot.service';
import type { LicenseLotViewService } from './license-lot-view.service';

const tx = { tag: 'tx' };
const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
const actor = {
  appUserId: 'u-it',
  sessionId: 's-1',
  employeeId: 'emp-it',
  roles: ['IT_ADMIN'],
} as unknown as AuthenticatedPrincipal;

function lotRecord(changes: Partial<LicenseLotRecord> = {}): LicenseLotRecord {
  return {
    id: 'lot-1',
    organizationId: 'org-1',
    planId: 'plan-1',
    workspaceId: null,
    purchasedOn: '2026-11-01',
    licenseCount: 3,
    unitPriceMinor: 6_000_000n,
    originalUnitPriceMinor: null,
    originalCurrency: null,
    invoiceActualMinor: null,
    purpose: 'REPLACEMENT',
    requestId: null,
    contractId: null,
    responsibleItAdminEmployeeId: 'emp-it',
    legacySubscriptionId: null,
    note: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...changes,
  };
}

function setup(options: { hasLotBeenUsed: boolean; keysAssigned?: number; lot?: LicenseLotRecord }) {
  const lot = options.lot ?? lotRecord();
  const lots = {
    lock: jest.fn().mockResolvedValue(lot),
    update: jest
      .fn()
      .mockImplementation((_tx: unknown, _id: string, changes: { unitPriceMinor?: bigint }) =>
        Promise.resolve({ ...lot, unitPriceMinor: changes.unitPriceMinor ?? lot.unitPriceMinor }),
      ),
  };
  const views = {
    viewAll: jest.fn().mockImplementation((rows: LicenseLotRecord[]) => Promise.resolve(rows)),
  };
  const pricing = {
    readUnitPrice: jest.fn().mockResolvedValue({ amountMinor: 7_000_000n, currency: 'VND' }),
  };
  const reader = {
    keyCountsOfLots: jest
      .fn()
      .mockResolvedValue(new Map([['lot-1', { inStore: 1, assigned: options.keysAssigned ?? 0, withdrawn: 0 }]])),
    hasLotBeenUsed: jest.fn().mockResolvedValue(options.hasLotBeenUsed),
  };
  const occupancy = { get: () => reader } as unknown as SeatOccupancyHook;
  const organizationReads = { getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const service = new LicenseLotService(
    lots as unknown as LicenseLotRepo,
    views as unknown as LicenseLotViewService,
    pricing as unknown as LicenseLotPriceService,
    occupancy,
    organizationReads as unknown as OrganizationReadApi,
    audit as unknown as AuditApi,
    runner,
  );

  return { service, lots, reader };
}

describe('LicenseLotService.update (price lock T-5)', () => {
  it('refuses unitPrice update with 409 LICENSE_LOT.PRICE_LOCKED when lot has usage or charge history even with keysAssigned === 0', async () => {
    const { service, lots } = setup({ hasLotBeenUsed: true, keysAssigned: 0 });

    let caught: unknown;
    try {
      await service.update(actor, 'lot-1', {
        unitPrice: { amount: '7000000', currency: 'VND' },
        expectedUpdatedAt: new Date('2026-11-01T00:00:00Z'),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LicenseLotPriceLockedError);
    const mapped = toLicenseLotApiException(caught) as {
      getStatus?: () => number;
      getResponse?: () => { code?: string };
    };
    expect(mapped.getStatus?.()).toBe(409);
    expect(mapped.getResponse?.().code).toBe('LICENSE_LOT.PRICE_LOCKED');
    expect(lots.update).not.toHaveBeenCalled();
  });

  it('allows unitPrice update when invoiceActualMinor is null, keysAssigned === 0, and hasLotBeenUsed is false', async () => {
    const { service, lots } = setup({ hasLotBeenUsed: false, keysAssigned: 0 });

    await service.update(actor, 'lot-1', {
      unitPrice: { amount: '7000000', currency: 'VND' },
      expectedUpdatedAt: new Date('2026-11-01T00:00:00Z'),
    });

    expect(lots.update).toHaveBeenCalledWith(tx, 'lot-1', { unitPriceMinor: 7_000_000n });
  });
});
