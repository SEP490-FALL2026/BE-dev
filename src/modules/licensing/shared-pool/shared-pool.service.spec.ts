import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import { LicenseLotReservedForRequestError } from '../../catalog/public/catalog.errors';
import type { LicenseLotStockApi } from '../../catalog/public/license-lot-stock.api';
import type { SeatLedgerApi } from '../../catalog/public/seat-ledger.api';
import type { GrantRequestGateHook } from '../public/licensing.extension-points';
import type { SharedPoolAvoidedCostRepo } from './shared-pool-avoided-cost.repo';
import type { SharedPoolCapacityRepo } from './shared-pool-capacity.repo';
import { SharedPoolService } from './shared-pool.service';

describe('SharedPoolService (ledger seats & chooseLine)', () => {
  const tx = { kind: 'tx' } as unknown as DbTx;

  it('reads K2 line seats from SeatLedgerApi.seatsOnDays and occupancy per plan', async () => {
    const catalog = {
      getGrantableSubscriptions: jest.fn().mockResolvedValue([
        {
          subscriptionId: 'sub-1',
          subscriptionLineId: 'line-1',
          lineCreatedAt: new Date('2026-07-01T00:00:00.000Z'),
          purchasedQuantity: 5,
          isPrimaryForPlan: false,
        },
      ]),
    };
    const capacityRepo = {
      endingAmong: jest.fn().mockResolvedValue(new Set()),
      occupancyOfPlan: jest.fn().mockResolvedValue(new Map([['sub-1', { occupied: 10, inRevocation: 0 }]])),
    };
    const seatLedger = {
      seatsOnDays: jest.fn().mockResolvedValue(new Map([['line-1', new Map([['2026-11-21', 12]])]])),
    };

    const gate = {
      isBound: () => true,
      get: () => ({ reservedForRequestLots: jest.fn().mockResolvedValue(new Map()) }),
    } as unknown as GrantRequestGateHook;

    const service = new SharedPoolService(
      catalog as unknown as CatalogApi,
      capacityRepo as unknown as SharedPoolCapacityRepo,
      {} as unknown as SharedPoolAvoidedCostRepo,
      seatLedger as unknown as SeatLedgerApi,
      {
        accountLotCandidates: jest.fn().mockResolvedValue([]),
        chooseAccountLot: jest.fn(),
      } as unknown as LicenseLotStockApi,
      gate,
    );

    const stock = await service.stockOf(tx, 'plan-1', '2026-11-21', 'K2');

    expect(capacityRepo.occupancyOfPlan).toHaveBeenCalledWith(tx, ['sub-1'], 'plan-1', '2026-11-21');
    expect(seatLedger.seatsOnDays).toHaveBeenCalledWith(['line-1'], '2026-11-21', '2026-11-21', tx);
    expect(stock.free).toBe(2);
  });

  it('chooseLine selects the line with free seats before an older full line', async () => {
    const catalog = {
      getGrantableSubscriptions: jest.fn().mockResolvedValue([
        {
          subscriptionId: 'sub-old',
          subscriptionLineId: 'line-old',
          lineCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
          purchasedQuantity: 2,
          isPrimaryForPlan: true,
        },
        {
          subscriptionId: 'sub-new',
          subscriptionLineId: 'line-new',
          lineCreatedAt: new Date('2026-06-01T00:00:00.000Z'),
          purchasedQuantity: 3,
          isPrimaryForPlan: false,
        },
      ]),
    };
    const capacityRepo = {
      endingAmong: jest.fn().mockResolvedValue(new Set()),
      occupancyOfPlan: jest.fn().mockResolvedValue(
        new Map([
          ['sub-old', { occupied: 2, inRevocation: 0 }],
          ['sub-new', { occupied: 1, inRevocation: 0 }],
        ]),
      ),
    };
    const seatLedger = {
      seatsOnDays: jest.fn().mockResolvedValue(
        new Map([
          ['line-old', new Map([['2026-11-21', 2]])],
          ['line-new', new Map([['2026-11-21', 3]])],
        ]),
      ),
    };

    const gate = {
      isBound: () => true,
      get: () => ({ reservedForRequestLots: jest.fn().mockResolvedValue(new Map()) }),
    } as unknown as GrantRequestGateHook;

    const service = new SharedPoolService(
      catalog as unknown as CatalogApi,
      capacityRepo as unknown as SharedPoolCapacityRepo,
      {} as unknown as SharedPoolAvoidedCostRepo,
      seatLedger as unknown as SeatLedgerApi,
      {
        accountLotCandidates: jest.fn().mockResolvedValue([]),
        chooseAccountLot: jest.fn(),
      } as unknown as LicenseLotStockApi,
      gate,
    );

    const chosen = await service.chooseLine(tx, {
      planId: 'plan-1',
      provisioningType: 'K2',
      today: '2026-11-21',
    });

    expect(chosen).toBe('sub-new');
  });

  it('P13a W3-17: K1 skips closed/legacy K1 subscriptions in chooseLine and stockOf', async () => {
    const getGrantableSubscriptions = jest.fn();
    const service = new SharedPoolService(
      { getGrantableSubscriptions } as unknown as CatalogApi,
      {} as unknown as SharedPoolCapacityRepo,
      {} as unknown as SharedPoolAvoidedCostRepo,
      {} as unknown as SeatLedgerApi,
      {
        accountLotCandidates: jest.fn().mockResolvedValue([]),
        chooseAccountLot: jest.fn(),
      } as unknown as LicenseLotStockApi,
      { isBound: () => true, get: () => ({ reservedForRequestLots: jest.fn() }) } as unknown as GrantRequestGateHook,
    );

    expect(await service.chooseLine(tx, { planId: 'plan-k1', provisioningType: 'K1', today: '2026-11-21' })).toBeNull();
    const stock = await service.stockOf(tx, 'plan-k1', '2026-11-21', 'K1');
    expect(stock.free).toBe(0);
    expect(stock.freeSubscriptionIds).toEqual([]);
    expect(getGrantableSubscriptions).not.toHaveBeenCalled();
  });

  it('chosenLinesOfPlans resolves the chosen line per plan in batch', async () => {
    const catalog = {
      getGrantableSubscriptionsOfPlans: jest.fn().mockResolvedValue(
        new Map([
          [
            'plan-1',
            [
              {
                subscriptionId: 'sub-full',
                subscriptionLineId: 'line-full',
                lineCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
                purchasedQuantity: 2,
                isPrimaryForPlan: false,
              },
              {
                subscriptionId: 'sub-free',
                subscriptionLineId: 'line-free',
                lineCreatedAt: new Date('2026-06-01T00:00:00.000Z'),
                purchasedQuantity: 5,
                isPrimaryForPlan: false,
              },
            ],
          ],
        ]),
      ),
    };
    const capacityRepo = {
      endingAmong: jest.fn().mockResolvedValue(new Set()),
      occupancyOfPlanPairs: jest.fn().mockResolvedValue(
        new Map([
          ['sub-full:plan-1', { occupied: 2, inRevocation: 0 }],
          ['sub-free:plan-1', { occupied: 1, inRevocation: 0 }],
        ]),
      ),
    };
    const seatLedger = {
      seatsOnDays: jest.fn().mockResolvedValue(
        new Map([
          ['line-full', new Map([['2026-11-21', 2]])],
          ['line-free', new Map([['2026-11-21', 5]])],
        ]),
      ),
    };
    const gate = {
      isBound: () => true,
      get: () => ({ reservedForRequestLots: jest.fn().mockResolvedValue(new Map()) }),
    } as unknown as GrantRequestGateHook;

    const service = new SharedPoolService(
      catalog as unknown as CatalogApi,
      capacityRepo as unknown as SharedPoolCapacityRepo,
      {} as unknown as SharedPoolAvoidedCostRepo,
      seatLedger as unknown as SeatLedgerApi,
      {
        accountLotCandidates: jest.fn().mockResolvedValue([]),
        chooseAccountLot: jest.fn(),
      } as unknown as LicenseLotStockApi,
      gate,
    );

    const chosen = await service.chosenLinesOfPlans(['plan-1'], '2026-11-21', tx);

    expect(chosen.get('plan-1')).toEqual({ subscriptionId: 'sub-free', subscriptionLineId: 'line-free' });
  });

  it('W3-24: K4 chooseLine selects lot via LicenseLotStockApi and throws LicenseLotReservedForRequestError on F11', async () => {
    const lotStock = {
      accountLotCandidates: jest.fn().mockResolvedValue([
        {
          id: 'lot-duc',
          purchasedOn: '2027-04-01',
          licenseCount: 3,
          unitPriceMinor: 12_000_000n,
          purpose: 'REQUEST',
          requestId: 'req-duc',
          legacySubscriptionId: null,
          free: 1,
          keysInStore: 1,
          openTasksWithoutKey: 0,
          grantable: 1,
          excessGrantable: 0,
        },
      ]),
      chooseAccountLot: jest.fn().mockResolvedValue({
        kind: 'RESERVED_FOR_REQUEST',
        lot: { id: 'lot-duc' },
      }),
    } as unknown as LicenseLotStockApi;
    const gate = {
      isBound: () => true,
      get: () => ({
        reservedForRequestLots: jest
          .fn()
          .mockResolvedValue(new Map([['lot-duc', { beneficiaries: 1, chargedExcess: 2 }]])),
      }),
    } as unknown as GrantRequestGateHook;

    const service = k4PoolService(lotStock, gate);

    await expect(
      service.chooseLine(tx, {
        planId: 'plan-cad',
        provisioningType: 'K4',
        today: '2027-04-10',
        requestId: 'req-minh',
      }),
    ).rejects.toBeInstanceOf(LicenseLotReservedForRequestError);
  });

  const k4PoolService = (lotStock: LicenseLotStockApi, gate: GrantRequestGateHook) =>
    new SharedPoolService(
      {} as unknown as CatalogApi,
      {} as unknown as SharedPoolCapacityRepo,
      {} as unknown as SharedPoolAvoidedCostRepo,
      {} as unknown as SeatLedgerApi,
      lotStock,
      gate,
    );

  it('F-17: K4 chooseLine takes purchase path (returns null) on RESERVED_FOR_REQUEST when allowPurchase is true', async () => {
    const lotStock = {
      accountLotCandidates: jest.fn().mockResolvedValue([
        {
          id: 'lot-duc',
          purchasedOn: '2027-04-01',
          licenseCount: 3,
          unitPriceMinor: 12_000_000n,
          purpose: 'REQUEST',
          requestId: 'req-duc',
          legacySubscriptionId: null,
          free: 1,
          keysInStore: 1,
          openTasksWithoutKey: 0,
          grantable: 1,
          excessGrantable: 0,
        },
      ]),
      chooseAccountLot: jest.fn().mockResolvedValue({
        kind: 'RESERVED_FOR_REQUEST',
        lot: { id: 'lot-duc' },
      }),
    } as unknown as LicenseLotStockApi;
    const gate = {
      isBound: () => true,
      get: () => ({
        reservedForRequestLots: jest
          .fn()
          .mockResolvedValue(new Map([['lot-duc', { beneficiaries: 1, chargedExcess: 2 }]])),
      }),
    } as unknown as GrantRequestGateHook;

    const service = k4PoolService(lotStock, gate);

    await expect(
      service.chooseLine(tx, {
        planId: 'plan-cad',
        provisioningType: 'K4',
        today: '2027-04-10',
        requestId: 'req-minh',
        allowPurchase: true,
      }),
    ).resolves.toBeNull();
  });

  it('F-17: assertK4LotGrantable throws LicenseLotReservedForRequestError when named REQUEST lot has excessGrantable <= 0 and loads all REQUEST lot reservations', async () => {
    const lot = (id: string, requestId: string, licenseCount: number, purchasedOn: string) => ({
      id,
      purchasedOn,
      licenseCount,
      unitPriceMinor: 12_000_000n,
      purpose: 'REQUEST' as const,
      requestId,
      legacySubscriptionId: null,
      free: licenseCount,
      keysInStore: licenseCount,
      openTasksWithoutKey: 1,
      beneficiaries: 2,
      chargedExcess: 0,
      grantable: licenseCount - 1,
      excessGrantable: 0,
    });
    const reservedForRequestLots = jest.fn().mockResolvedValue(
      new Map([
        ['lot-older', { beneficiaries: 2, chargedExcess: 0 }],
        ['lot-duc', { beneficiaries: 2, chargedExcess: 0 }],
      ]),
    );
    const lotStock = {
      accountLotCandidates: jest
        .fn()
        .mockResolvedValue([
          lot('lot-older', 'req-older', 3, '2027-03-01'),
          lot('lot-duc', 'req-duc', 2, '2027-04-01'),
        ]),
    } as unknown as LicenseLotStockApi;
    const gate = {
      isBound: () => true,
      get: () => ({ reservedForRequestLots }),
    } as unknown as GrantRequestGateHook;

    const service = k4PoolService(lotStock, gate);

    await expect(
      service.assertK4LotGrantable(tx, { planId: 'plan-cad', lotId: 'lot-duc', requestId: 'req-minh' }),
    ).rejects.toBeInstanceOf(LicenseLotReservedForRequestError);
    expect(reservedForRequestLots).toHaveBeenCalledWith(
      [
        { lotId: 'lot-older', requestId: 'req-older' },
        { lotId: 'lot-duc', requestId: 'req-duc' },
      ],
      tx,
    );
  });

  it('G-4: lotReservationsOf fails loudly when GrantRequestGateHook is unbound', async () => {
    const { GrantRequestGateHook: HookClass } = await import('../public/licensing.extension-points');
    const unboundGate = new HookClass();
    const service = new SharedPoolService(
      {} as unknown as CatalogApi,
      {} as unknown as SharedPoolCapacityRepo,
      {} as unknown as SharedPoolAvoidedCostRepo,
      {} as unknown as SeatLedgerApi,
      {} as unknown as LicenseLotStockApi,
      unboundGate,
    );

    await expect(
      service.lotReservationsOf(
        [
          {
            id: 'lot-duc',
            purchasedOn: '2027-04-01',
            licenseCount: 3,
            unitPriceMinor: 12_000_000n,
            purpose: 'REQUEST',
            requestId: 'req-duc',
            legacySubscriptionId: null,
            free: 1,
            keysInStore: 1,
            openTasksWithoutKey: 0,
            grantable: 1,
            excessGrantable: 2,
          },
        ],
        tx,
      ),
    ).rejects.toThrow('not bound');
  });
});
