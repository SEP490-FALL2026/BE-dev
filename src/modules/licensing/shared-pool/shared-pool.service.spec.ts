import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { SeatLedgerApi } from '../../catalog/public/seat-ledger.api';
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

    const service = new SharedPoolService(
      catalog as unknown as CatalogApi,
      capacityRepo as unknown as SharedPoolCapacityRepo,
      {} as unknown as SharedPoolAvoidedCostRepo,
      seatLedger as unknown as SeatLedgerApi,
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

    const service = new SharedPoolService(
      catalog as unknown as CatalogApi,
      capacityRepo as unknown as SharedPoolCapacityRepo,
      {} as unknown as SharedPoolAvoidedCostRepo,
      seatLedger as unknown as SeatLedgerApi,
    );

    const chosen = await service.chooseLine(tx, {
      planId: 'plan-1',
      provisioningType: 'K2',
      today: '2026-11-21',
    });

    expect(chosen).toBe('sub-new');
  });
});
