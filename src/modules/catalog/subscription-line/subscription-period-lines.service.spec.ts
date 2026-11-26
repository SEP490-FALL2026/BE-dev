import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { SeatLedgerService } from './ledger/seat-ledger.service';
import type { SubscriptionLineRepo } from './subscription-line.repo';
import { SubscriptionPeriodLinesService } from './subscription-period-lines.service';
import type { SubscriptionLineRecord } from './subscription-line.types';

function line(extra: Partial<SubscriptionLineRecord> = {}): SubscriptionLineRecord {
  return {
    id: 'line-1',
    organizationId: 'org-1',
    subscriptionId: 'sub-1',
    workspaceId: 'ws-1',
    planId: 'plan-1',
    monthlyUnitPriceMinor: 50000n,
    minimumSeats: 5,
    ledgerOpenedOn: '2026-01-01',
    renewedFromLineId: null,
    closedOn: null,
    closedReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...extra,
  };
}

describe('SubscriptionPeriodLinesService (P18 renewal close & continuation lines)', () => {
  const tx = {} as DbTx;
  const lines = {
    ofSubscriptions: jest.fn(),
    lockMany: jest.fn(),
    close: jest.fn(),
    insert: jest.fn(),
  };
  const seatLedger = { openNextPeriod: jest.fn() };
  const organization = { getOrganization: jest.fn() };
  const service = new SubscriptionPeriodLinesService(
    lines as unknown as SubscriptionLineRepo,
    seatLedger as unknown as SeatLedgerService,
    organization as unknown as OrganizationReadApi,
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('closeLines locks lines and closes only live ones with the given reason', async () => {
    const l1 = line({ id: 'line-1', closedReason: null });
    const l2 = line({ id: 'line-2', closedReason: 'REMOVED' });
    lines.ofSubscriptions.mockResolvedValue(new Map([['sub-1', [l1, l2]]]));
    lines.lockMany.mockResolvedValue([l1, l2]);

    await service.closeLines(tx, 'sub-1', '2026-12-31', 'ENDED');

    expect(lines.lockMany).toHaveBeenCalledWith(tx, ['line-1', 'line-2']);
    expect(lines.close).toHaveBeenCalledTimes(1);
    expect(lines.close).toHaveBeenCalledWith(tx, 'line-1', '2026-12-31', 'ENDED');
  });

  it('createRenewedLines skips quantity 0 lines, links renewedFromLineId, and opens ledger with RENEWAL', async () => {
    const std = line({ id: 'line-std', planId: 'plan-std', monthlyUnitPriceMinor: 50000n, minimumSeats: 5 });
    const prm = line({ id: 'line-prm', planId: 'plan-prm', monthlyUnitPriceMinor: 100000n, minimumSeats: null });
    lines.insert.mockResolvedValueOnce(line({ id: 'line-std-next', planId: 'plan-std' }));

    await service.createRenewedLines(tx, {
      organizationId: 'org-1',
      nextSubscriptionId: 'sub-2',
      workspaceId: 'ws-1',
      startDate: '2027-01-01',
      renewalId: 'ren-1',
      autoRecorded: true,
      recordedByEmployeeId: 'emp-ignored-when-auto',
      resolved: [
        { oldLine: std, quantity: 15, monthlyUnitPriceMinor: 50000n },
        { oldLine: prm, quantity: 0, monthlyUnitPriceMinor: 100000n },
      ],
    });

    expect(lines.insert).toHaveBeenCalledTimes(1);
    expect(lines.insert).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      subscriptionId: 'sub-2',
      workspaceId: 'ws-1',
      planId: 'plan-std',
      monthlyUnitPriceMinor: 50000n,
      minimumSeats: 5,
      renewedFromLineId: 'line-std',
    });
    expect(seatLedger.openNextPeriod).toHaveBeenCalledWith(tx, {
      lines: [
        {
          lineId: 'line-std-next',
          quantity: 15,
          effectiveOn: '2027-01-01',
          renewalId: 'ren-1',
          autoRecorded: true,
          recordedByEmployeeId: null,
        },
      ],
    });
  });
});
