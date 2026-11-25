import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { LockedPlan, PlanFactsService } from '../plan/plan-facts.service';
import { LicenseLotLockService } from './license-lot-lock.service';
import type { LicenseLotRepo } from './license-lot.repo';
import type { LicenseLotRecord } from './license-lot.types';

const lot = (over: Partial<LicenseLotRecord> = {}): LicenseLotRecord => ({
  id: 'lot-1',
  organizationId: 'org-1',
  planId: 'plan-1',
  workspaceId: null,
  purchasedOn: '2026-09-01',
  licenseCount: 3,
  unitPriceMinor: 1500000n,
  originalUnitPriceMinor: null,
  originalCurrency: null,
  invoiceActualMinor: null,
  purpose: 'OPENING',
  requestId: null,
  contractId: null,
  responsibleItAdminEmployeeId: 'it-1',
  legacySubscriptionId: 'lot-1',
  note: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-02T00:00:00Z'),
  ...over,
});

const plan = {
  id: 'plan-1',
  name: 'IntelliJ',
  provisioningType: 'K4',
  keyBinding: 'ACCOUNT',
  applicationId: 'app-1',
  applicationName: 'JetBrains',
  applicationKind: 'LICENSED',
  applicationStatus: 'APPROVED',
} as unknown as LockedPlan;

describe('LicenseLotLockService (tier 6a, then the plan at tier 7)', () => {
  const tx = {} as DbTx;

  function setup(found: LicenseLotRecord | null, foundPlan: LockedPlan | null = plan) {
    const order: string[] = [];
    const lots = {
      lock: jest.fn().mockImplementation(() => {
        order.push('lot');
        return Promise.resolve(found);
      }),
      find: jest.fn().mockResolvedValue(found),
      findMany: jest.fn().mockResolvedValue(new Map(found ? [[found.id, found]] : [])),
    } as unknown as LicenseLotRepo;
    const plans = {
      lockShared: jest.fn().mockImplementation(() => {
        order.push('plan');
        return Promise.resolve(foundPlan);
      }),
      lookups: jest.fn().mockResolvedValue(foundPlan ? [foundPlan] : []),
    } as unknown as PlanFactsService;

    return { service: new LicenseLotLockService(lots, plans), lots, plans, order };
  }

  it('locks the lot before its plan and answers the lot with the plan and the application it belongs to', async () => {
    const { service, order } = setup(lot());

    await expect(service.lock(tx, 'lot-1')).resolves.toMatchObject({
      id: 'lot-1',
      licenseCount: 3,
      unitPriceMinor: 1500000n,
      planId: 'plan-1',
      planName: 'IntelliJ',
      keyBinding: 'ACCOUNT',
      applicationName: 'JetBrains',
      applicationStatus: 'APPROVED',
      legacySubscriptionId: 'lot-1',
    });
    expect(order).toEqual(['lot', 'plan']);
  });

  it('answers null, and takes no lock on a plan, when the lot does not exist', async () => {
    const { service, plans, order } = setup(null);

    await expect(service.lock(tx, 'lot-9')).resolves.toBeNull();
    expect(order).toEqual(['lot']);
    expect((plans as unknown as { lockShared: jest.Mock }).lockShared).not.toHaveBeenCalled();
  });

  it('answers null when the plan of the lot is gone', async () => {
    const { service } = setup(lot(), null);

    await expect(service.lock(tx, 'lot-1')).resolves.toBeNull();
    await expect(service.find('lot-1')).resolves.toBeNull();
  });

  it('reads a lot without a lock, and says which ids are lots in one read', async () => {
    const { service, lots, plans } = setup(lot());

    await expect(service.find('lot-1')).resolves.toMatchObject({ id: 'lot-1', planName: 'IntelliJ' });
    expect((plans as unknown as { lockShared: jest.Mock }).lockShared).not.toHaveBeenCalled();
    await expect(service.idsOfLots(['lot-1', 'sub-9'])).resolves.toEqual(new Set(['lot-1']));
    expect((lots as unknown as { findMany: jest.Mock }).findMany).toHaveBeenCalledTimes(1);
  });
});
