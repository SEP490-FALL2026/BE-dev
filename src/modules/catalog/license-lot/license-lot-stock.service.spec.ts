import type { SeatOccupancyHook } from '../public/catalog.extension-points';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { PlanFactsService } from '../plan/plan-facts.service';
import type { LicenseLotRepo } from './license-lot.repo';
import type { LicenseLotRecord } from './license-lot.types';
import { LicenseLotStockService } from './license-lot-stock.service';

const lot = (over: Partial<LicenseLotRecord> = {}): LicenseLotRecord => ({
  id: 'lot-1',
  organizationId: 'org-1',
  planId: 'plan-1',
  workspaceId: null,
  purchasedOn: '2027-04-01',
  licenseCount: 3,
  unitPriceMinor: 12_000_000n,
  originalUnitPriceMinor: null,
  originalCurrency: null,
  invoiceActualMinor: null,
  purpose: 'REQUEST',
  requestId: 'req-1',
  contractId: null,
  responsibleItAdminEmployeeId: 'it-1',
  legacySubscriptionId: null,
  note: null,
  createdAt: new Date('2027-04-01T00:00:00Z'),
  updatedAt: new Date('2027-04-01T00:00:00Z'),
  ...over,
});

describe('LicenseLotStockService (W3-24)', () => {
  const build = (overrides?: {
    lots?: LicenseLotRecord[];
    occupied?: number;
    inStore?: number;
    openTasks?: Array<{
      taskId: string;
      planId: string;
      requestId: string | null;
      subscriptionId: string | null;
      createdAt: Date;
    }>;
  }) => {
    const lotRows = overrides?.lots ?? [lot()];
    const repo = {
      ofPlan: jest.fn().mockResolvedValue(lotRows),
      ofPlans: jest.fn().mockResolvedValue(new Map([['plan-1', lotRows]])),
    } as unknown as LicenseLotRepo;
    const occupancy = {
      get: () => ({
        seatsOfSubscriptions: jest
          .fn()
          .mockResolvedValue(
            new Map(lotRows.map((l) => [l.id, { occupied: overrides?.occupied ?? 1, inRevocation: 0 }])),
          ),
        keyCountsOfLots: jest
          .fn()
          .mockResolvedValue(
            new Map(lotRows.map((l) => [l.id, { inStore: overrides?.inStore ?? 2, assigned: 1, withdrawn: 0 }])),
          ),
        openGrantTasksWithoutKeyOfPlans: jest.fn().mockResolvedValue(overrides?.openTasks ?? []),
      }),
    } as unknown as SeatOccupancyHook;
    const plans = {
      lookups: jest.fn().mockResolvedValue([{ id: 'plan-1', provisioningType: 'K4', keyBinding: 'ACCOUNT' }]),
    } as unknown as PlanFactsService;
    const orgReads = {
      businessToday: jest.fn().mockResolvedValue('2027-04-15'),
    } as unknown as OrganizationReadApi;

    return new LicenseLotStockService(repo, plans, occupancy, orgReads);
  };

  it('computes free, keysInStore, and grantable subtracting open grant tasks without a key', async () => {
    const service = build({
      lots: [lot({ id: 'lot-1', licenseCount: 3 })],
      occupied: 1,
      inStore: 2,
      openTasks: [
        {
          taskId: 't-1',
          planId: 'plan-1',
          requestId: 'req-1',
          subscriptionId: null,
          createdAt: new Date('2027-04-02T00:00:00Z'),
        },
      ],
    });

    const candidates = await service.accountLotCandidates('plan-1');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: 'lot-1',
      free: 2,
      keysInStore: 2,
      openTasksWithoutKey: 1,
      grantable: 1,
    });
  });

  it('picks newest lot with free > 0 for K-A5 unit price', async () => {
    const service = new LicenseLotStockService(
      {
        ofPlan: jest
          .fn()
          .mockResolvedValue([
            lot({ id: 'lot-jan', purchasedOn: '2027-01-01', licenseCount: 2, unitPriceMinor: 11_000_000n }),
            lot({ id: 'lot-apr', purchasedOn: '2027-04-01', licenseCount: 2, unitPriceMinor: 12_000_000n }),
          ]),
      } as unknown as LicenseLotRepo,
      {
        lookups: jest.fn().mockResolvedValue([{ id: 'plan-1', provisioningType: 'K4', keyBinding: 'ACCOUNT' }]),
      } as unknown as PlanFactsService,
      {
        get: () => ({
          seatsOfSubscriptions: jest.fn().mockResolvedValue(
            new Map([
              ['lot-jan', { occupied: 1, inRevocation: 0 }],
              ['lot-apr', { occupied: 2, inRevocation: 0 }],
            ]),
          ),
          keyCountsOfLots: jest.fn().mockResolvedValue(new Map()),
          openGrantTasksWithoutKeyOfPlans: jest.fn().mockResolvedValue([]),
        }),
      } as unknown as SeatOccupancyHook,
      { businessToday: jest.fn().mockResolvedValue('2027-04-15') } as unknown as OrganizationReadApi,
    );

    expect(await service.newestFreeLotUnitPrice('plan-1')).toBe(11_000_000n);
  });

  it('G-5: subtracts open excess tasks without a key from excessGrantable while excluding own request tasks', async () => {
    const service = build({
      lots: [lot({ id: 'lot-1', licenseCount: 3, requestId: 'req-c' })],
      occupied: 0,
      inStore: 3,
      openTasks: [
        {
          taskId: 't-own',
          planId: 'plan-1',
          requestId: 'req-c',
          subscriptionId: 'lot-1',
          createdAt: new Date('2027-04-02T00:00:00Z'),
        },
        {
          taskId: 't-excess',
          planId: 'plan-1',
          requestId: 'req-a',
          subscriptionId: 'lot-1',
          createdAt: new Date('2027-04-03T00:00:00Z'),
        },
      ],
    });

    const candidates = await service.accountLotCandidates('plan-1', {
      reservations: new Map([['lot-1', { beneficiaries: 2, chargedExcess: 0 }]]),
    });
    expect(candidates[0]).toMatchObject({
      openTasksWithoutKey: 2,
      openExcessTasksWithoutKey: 1,
      grantable: 1,
      excessGrantable: 0,
    });
  });
});
