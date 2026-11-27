import type { CatalogApi } from '../../../catalog/public/catalog.api';
import type { LicenseLotApi } from '../../../catalog/public/license-lot.api';
import type { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import type { SeatTarget } from '../../../catalog/public/catalog.types';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { AssignmentRepo } from '../assignment.repo';
import type { DeviceActivationRepo } from '../../device-activation/device-activation.repo';
import { SubscriptionSeatUsageService } from './seat-usage-occupancy.service';

const k2Target: SeatTarget = {
  kind: 'SUBSCRIPTION',
  subscriptionId: 'sub-1',
  planId: 'plan-1',
  planName: 'FigJam',
  applicationId: 'app-1',
  applicationName: 'Figma',
  applicationKind: 'SAAS',
  applicationStatus: 'APPROVED',
  provisioningType: 'K2',
  keyBinding: null,
  status: 'ACTIVE',
  purchasedQuantity: 99,
  missing: [],
  allowsMidTermReduction: false,
};

describe('SubscriptionSeatUsageService K2 lines (DL-2, W3-15)', () => {
  it('sums seatsToday of serving lines for K2 via CatalogApi and SeatLedgerApi', async () => {
    const assignments = { countOccupying: jest.fn().mockResolvedValue(4) } as unknown as AssignmentRepo;
    const deviceActivations = {
      occupiedBySubscription: jest.fn().mockResolvedValue(0),
    } as unknown as DeviceActivationRepo;
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2026-11-21'),
    } as unknown as OrganizationReadApi;
    const getSubscriptionServingLineIds = jest
      .fn()
      .mockResolvedValue({ hasLines: true, servingLineIds: ['line-1', 'line-2'] });
    const catalog = {
      findSeatTarget: jest.fn().mockResolvedValue(k2Target),
      getSubscriptionServingLineIds,
    } as unknown as CatalogApi;
    const lots = { findLot: jest.fn() } as unknown as LicenseLotApi;
    const seatsOnDays = jest.fn().mockResolvedValue(
      new Map([
        ['line-1', new Map([['2026-11-21', 5]])],
        ['line-2', new Map([['2026-11-21', 7]])],
      ]),
    );
    const seatLedger = { seatsOnDays } as unknown as SeatLedgerApi;

    const service = new SubscriptionSeatUsageService(
      assignments,
      deviceActivations,
      organizationReads,
      catalog,
      lots,
      seatLedger,
    );

    const usage = await service.get('sub-1');

    expect(getSubscriptionServingLineIds).toHaveBeenCalledWith('sub-1', '2026-11-21');
    expect(seatsOnDays).toHaveBeenCalledWith(['line-1', 'line-2'], '2026-11-21', '2026-11-21');
    expect(usage).toEqual({
      subscriptionId: 'sub-1',
      purchased: 12,
      occupied: 4,
      free: 8,
      asOf: '2026-11-21',
    });
  });

  it('returns purchased = 0 when K2 period has lines but none serve today', async () => {
    const service = new SubscriptionSeatUsageService(
      { countOccupying: jest.fn().mockResolvedValue(2) } as unknown as AssignmentRepo,
      { occupiedBySubscription: jest.fn().mockResolvedValue(0) } as unknown as DeviceActivationRepo,
      { businessToday: jest.fn().mockResolvedValue('2026-11-21') } as unknown as OrganizationReadApi,
      {
        findSeatTarget: jest.fn().mockResolvedValue(k2Target),
        getSubscriptionServingLineIds: jest.fn().mockResolvedValue({ hasLines: true, servingLineIds: [] }),
      } as unknown as CatalogApi,
      { findLot: jest.fn() } as unknown as LicenseLotApi,
      { seatsOnDays: jest.fn() } as unknown as SeatLedgerApi,
    );

    const usage = await service.get('sub-1');
    expect(usage).toEqual({
      subscriptionId: 'sub-1',
      purchased: 0,
      occupied: 2,
      free: 0,
      asOf: '2026-11-21',
    });
  });

  it('G-9: returns purchased = null and free = null when serving lines have no opened ledger yet', async () => {
    const service = new SubscriptionSeatUsageService(
      { countOccupying: jest.fn().mockResolvedValue(0) } as unknown as AssignmentRepo,
      { occupiedBySubscription: jest.fn().mockResolvedValue(0) } as unknown as DeviceActivationRepo,
      { businessToday: jest.fn().mockResolvedValue('2026-11-21') } as unknown as OrganizationReadApi,
      {
        findSeatTarget: jest.fn().mockResolvedValue({ ...k2Target, purchasedQuantity: null }),
        getSubscriptionServingLineIds: jest.fn().mockResolvedValue({ hasLines: true, servingLineIds: ['line-1'] }),
      } as unknown as CatalogApi,
      { findLot: jest.fn() } as unknown as LicenseLotApi,
      {
        seatsOnDays: jest.fn().mockResolvedValue(new Map([['line-1', new Map([['2026-11-21', null]])]])),
      } as unknown as SeatLedgerApi,
    );

    await expect(service.get('sub-1')).resolves.toEqual({
      subscriptionId: 'sub-1',
      purchased: null,
      occupied: 0,
      free: null,
      asOf: '2026-11-21',
    });
  });
});
