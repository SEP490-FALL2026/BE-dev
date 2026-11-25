import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { SeatPurchaseService } from '../purchase/seat-purchase.service';
import {
  SeatLedgerBelowOccupancyError,
  SeatLedgerEffectiveInClosedMonthError,
  SubscriptionLineNotFoundError,
} from '../subscription-line.errors';
import type { SubscriptionLineRepo } from '../subscription-line.repo';
import type { SubscriptionLineRecord } from '../subscription-line.types';
import type { SeatLedgerRepo } from './seat-ledger.repo';
import { SeatLedgerService } from './seat-ledger.service';

const actor = {
  appUserId: 'user-1',
  employeeId: 'emp-it',
  roles: ['IT_ADMIN'],
  sessionId: 'sess-1',
} as unknown as AuthenticatedPrincipal;

const makeLine = (overrides: Partial<SubscriptionLineRecord> = {}): SubscriptionLineRecord => ({
  id: 'line-1',
  organizationId: 'org-1',
  subscriptionId: 'sub-1',
  workspaceId: 'ws-1',
  planId: 'plan-1',
  monthlyUnitPriceMinor: 500_000n,
  minimumSeats: null,
  ledgerOpenedOn: '2026-07-01',
  renewedFromLineId: null,
  closedOn: null,
  closedReason: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  ...overrides,
});

function makeHarness(
  overrides: {
    lines?: Partial<SubscriptionLineRepo>;
    ledger?: Partial<SeatLedgerRepo>;
    purchases?: Partial<SeatPurchaseService>;
    parameters?: Partial<OperatingParametersApi>;
    organizationReads?: Partial<OrganizationReadApi>;
    audit?: Partial<AuditApi>;
  } = {},
) {
  const lines = {
    lock: jest.fn().mockResolvedValue(makeLine()),
    openLedger: jest.fn().mockResolvedValue(true),
    periodFactsOf: jest.fn().mockResolvedValue({ billingCycle: 'ANNUAL', invoicedLater: false }),
    findManyWithPeriod: jest.fn().mockResolvedValue([]),
    ...overrides.lines,
  };
  const ledger = {
    insert: jest
      .fn()
      .mockImplementation((_tx, input) =>
        Promise.resolve({ id: `chg-${Math.random()}`, recordedAt: new Date(), ...input }),
      ),
    ofLinesUpTo: jest.fn().mockResolvedValue([]),
    ...overrides.ledger,
  };
  const purchases = {
    insert: jest
      .fn()
      .mockImplementation((_tx, input) =>
        Promise.resolve({ id: 'pur-1', code: 'MUA-000001', recordedAt: new Date(), ...input }),
      ),
    ...overrides.purchases,
  };
  const parameters = {
    getValue: jest
      .fn()
      .mockImplementation((key: string) => Promise.resolve(key === 'SEAT_PURCHASE_INVOICE_DUE_WORKING_DAYS' ? 5 : 95)),
    getNonWorkingDates: jest.fn().mockResolvedValue(new Set()),
    ...overrides.parameters,
  };
  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue('2026-11-21'),
    ...overrides.organizationReads,
  };
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
    ...overrides.audit,
  };

  const service = new SeatLedgerService(
    lines as unknown as SubscriptionLineRepo,
    ledger as unknown as SeatLedgerRepo,
    purchases as unknown as SeatPurchaseService,
    parameters as unknown as OperatingParametersApi,
    organizationReads as unknown as OrganizationReadApi,
    audit as unknown as AuditApi,
  );

  return { service, lines, ledger, purchases, parameters, organizationReads, audit };
}

describe('SeatLedgerService', () => {
  const tx = { kind: 'tx' } as unknown as DbTx;

  it('openLines locks lines in id order, opens ledger for all, and inserts INITIAL only when quantity > 0', async () => {
    const lockOrder: string[] = [];
    const { service, lines, ledger } = makeHarness({
      lines: {
        lock: jest.fn().mockImplementation((_tx, id: string) => {
          lockOrder.push(id);
          return Promise.resolve(makeLine({ id, ledgerOpenedOn: null }));
        }),
      },
    });

    const rows = await service.openLines(tx, {
      lines: [
        { lineId: 'line-b', quantity: 0, effectiveOn: '2026-07-01' },
        { lineId: 'line-a', quantity: 10, effectiveOn: '2026-07-01' },
      ],
    });

    expect(lockOrder).toEqual(['line-a', 'line-b']);
    expect(lines.openLedger).toHaveBeenCalledTimes(2);
    expect(ledger.insert).toHaveBeenCalledTimes(1);
    expect(ledger.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        subscriptionLineId: 'line-a',
        delta: 10,
        reason: 'INITIAL',
        source: 'ADJUSTMENT',
        basis: 'NONE',
      }),
    );
    expect(rows).toHaveLength(1);
  });

  it('openLines throws SubscriptionLineNotFoundError when a line is missing', async () => {
    const { service } = makeHarness({ lines: { lock: jest.fn().mockResolvedValue(null) } });

    await expect(
      service.openLines(tx, { lines: [{ lineId: 'missing', quantity: 5, effectiveOn: '2026-07-01' }] }),
    ).rejects.toBeInstanceOf(SubscriptionLineNotFoundError);
  });

  it('buyForItems locks line, creates one SeatPurchase MUA- and sequential GRANT TOP_UP +1 rows, and audits', async () => {
    const { service, lines, purchases, ledger, audit } = makeHarness();

    const result = await service.buyForItems(
      tx,
      'line-1',
      [
        { requestId: 'req-1', beneficiaryEmployeeId: 'emp-1' },
        { requestId: 'req-2', beneficiaryEmployeeId: 'emp-2' },
      ],
      '2026-11-21',
      { actor },
    );

    expect(lines.lock).toHaveBeenCalledWith(tx, 'line-1');
    expect(purchases.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        subscriptionLineId: 'line-1',
        kind: 'TOP_UP',
        purchasedOn: '2026-11-21',
        quantity: 2,
        invoiceObligation: 'WORKING_DAYS',
        invoiceDueOn: '2026-11-27',
        recordedByEmployeeId: 'emp-it',
      }),
    );
    expect(ledger.insert).toHaveBeenCalledTimes(2);
    expect(ledger.insert).toHaveBeenNthCalledWith(
      1,
      tx,
      expect.objectContaining({
        source: 'GRANT',
        reason: 'TOP_UP',
        delta: 1,
        requestId: 'req-1',
        beneficiaryEmployeeId: 'emp-1',
        seatPurchaseId: 'pur-1',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'SEAT_PURCHASE.RECORDED', resourceId: 'pur-1' }),
    );
    expect(result.changes).toHaveLength(2);
  });

  it('buyForItems enforces closed-month check unless checkClosedMonth is false (for carryOrBuy)', async () => {
    const { service } = makeHarness({
      organizationReads: { businessToday: jest.fn().mockResolvedValue('2026-12-02') },
    });

    await expect(
      service.buyForItems(tx, makeLine(), [{ requestId: 'req-1', beneficiaryEmployeeId: 'emp-1' }], '2026-11-28', {
        actor,
        alreadyLocked: true,
      }),
    ).rejects.toMatchObject({
      name: SeatLedgerEffectiveInClosedMonthError.name,
      earliestOn: '2026-12-01',
    });

    await expect(
      service.buyForItems(tx, makeLine(), [{ requestId: 'req-1', beneficiaryEmployeeId: 'emp-1' }], '2027-07-01', {
        actor,
        alreadyLocked: true,
        checkClosedMonth: false,
      }),
    ).resolves.toMatchObject({ purchase: { code: 'MUA-000001' } });
  });

  it('recordVendor checks closed month, creates TIER_STEP purchase when tierStep=true, and propagates BELOW_OCCUPANCY', async () => {
    const { service, purchases, ledger } = makeHarness({
      organizationReads: { businessToday: jest.fn().mockResolvedValue('2026-12-02') },
    });

    await expect(
      service.recordVendor(tx, 'line-1', {
        delta: -1,
        effectiveOn: '2026-11-28',
        note: 'past month',
        actor,
      }),
    ).rejects.toBeInstanceOf(SeatLedgerEffectiveInClosedMonthError);

    const tierRes = await service.recordVendor(tx, 'line-1', {
      delta: 10,
      effectiveOn: '2026-12-02',
      note: 'tier step 50',
      actor,
      requestId: 'req-1',
      beneficiaryEmployeeId: 'emp-1',
      tierStep: true,
    });
    expect(purchases.insert).toHaveBeenCalledWith(tx, expect.objectContaining({ kind: 'TIER_STEP', quantity: 10 }));
    expect(tierRes.purchase).not.toBeNull();

    (ledger.insert as jest.Mock).mockRejectedValueOnce(new SeatLedgerBelowOccupancyError());
    await expect(
      service.recordVendor(tx, 'line-1', {
        delta: -3,
        effectiveOn: '2026-12-02',
        note: 'reduce',
        actor,
      }),
    ).rejects.toBeInstanceOf(SeatLedgerBelowOccupancyError);
  });

  it('openNextPeriod and recordMember write ADJUSTMENT/RENEWAL and MEMBER without closed-month check', async () => {
    const { service, ledger, lines } = makeHarness({
      organizationReads: { businessToday: jest.fn().mockResolvedValue('2027-08-01') },
    });

    await service.openNextPeriod(tx, {
      lines: [{ lineId: 'line-1', quantity: 11, effectiveOn: '2027-07-01', renewalId: 'ren-1', autoRecorded: true }],
    });
    expect(lines.openLedger).toHaveBeenCalledWith(tx, 'line-1', '2027-07-01');
    expect(ledger.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        source: 'ADJUSTMENT',
        reason: 'RENEWAL',
        delta: 11,
        renewalId: 'ren-1',
        autoRecorded: true,
      }),
    );

    await service.recordMember(tx, 'line-1', -1, '2027-07-15');
    expect(ledger.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ source: 'MEMBER', reason: 'REDUCE', delta: -1, effectiveOn: '2027-07-15' }),
    );
  });

  it('seatsOnDays combines line metadata and ledger rows per day', async () => {
    const { service } = makeHarness({
      lines: {
        findManyWithPeriod: jest.fn().mockResolvedValue([
          { id: 'line-1', ledgerOpenedOn: '2026-07-01', fallbackQuantity: 10 },
          { id: 'line-2', ledgerOpenedOn: null, fallbackQuantity: 4 },
        ]),
      },
      ledger: {
        ofLinesUpTo: jest.fn().mockResolvedValue([
          { subscriptionLineId: 'line-1', effectiveOn: '2026-07-01', delta: 10 },
          { subscriptionLineId: 'line-1', effectiveOn: '2026-11-21', delta: 2 },
        ]),
      },
    });

    const result = await service.seatsOnDays(['line-1', 'line-2'], '2026-11-20', '2026-11-22', tx);
    expect(result.get('line-1')?.get('2026-11-20')).toBe(10);
    expect(result.get('line-1')?.get('2026-11-21')).toBe(12);
    expect(result.get('line-2')?.get('2026-11-21')).toBe(4);
  });
});
