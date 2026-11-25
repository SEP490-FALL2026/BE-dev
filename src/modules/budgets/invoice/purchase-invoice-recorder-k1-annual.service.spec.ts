import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { CommitmentRepo } from '../budget/commitment.repo';
import type { InvoiceRecord, InvoiceRepo } from '../budget/invoice.repo';
import type { PurchaseInvoiceRecordInput } from '../public/budgets.types';
import type { ThresholdAlertService } from '../threshold/threshold-alert.service';
import type { InvoiceAllocationRepo } from './invoice-allocation.repo';
import type { InvoiceYearApplicationRepo } from './invoice-year-application.repo';
import { PurchaseInvoiceRecorderService } from './purchase-invoice-recorder.service';

const ACTOR = { employeeId: 'finance-1', appUserId: 'u-1', roles: ['FINANCE'] } as unknown as AuthenticatedPrincipal;
const TX = {} as DbTx;

const commitment = (over: Record<string, unknown> = {}) => ({
  id: 'c-1',
  year: 2027,
  organizationId: 'org-1',
  costCenterId: 'cc-1',
  amountMinor: 20_000n,
  releasedMinor: 0n,
  appliedMinor: 0n,
  state: 'HELD' as const,
  origin: 'APPROVAL' as const,
  seatMonthlyMinor: null,
  attachedVersionId: 'v-1' as string | null,
  ...over,
});

const input = (over: Partial<PurchaseInvoiceRecordInput> = {}): PurchaseInvoiceRecordInput => ({
  organizationId: 'org-1',
  purchaseInvoiceId: 'p-1',
  requestId: 'req-1',
  subscriptionId: null,
  vendorId: 'vendor-1',
  number: 'INV-1',
  issuedOn: '2027-01-05',
  serviceMonth: '2027-01-01',
  netMinor: 12_000n,
  deductibleTaxMinor: 0n,
  nonDeductibleTaxMinor: 0n,
  matchResult: 'MATCHED',
  chargedCostCenterId: 'cc-1',
  unallocated: null,
  now: new Date('2027-01-06T01:00:00.000Z'),
  ...over,
});

function build(opts: { commitments?: ReturnType<typeof commitment>[] } = {}) {
  const calls: string[] = [];
  const lockOfRequest = jest.fn<Promise<ReturnType<typeof commitment>[]>, [unknown, string]>(() => {
    calls.push('lock');

    return Promise.resolve(opts.commitments ?? [commitment()]);
  });
  const applyInvoice = jest.fn().mockResolvedValue(undefined);
  const insert = jest.fn((_tx: unknown, row: Record<string, unknown>) =>
    Promise.resolve({ id: 'inv-1', ...row } as unknown as InvoiceRecord),
  );
  const lockK1AllocationYears = jest.fn(() => {
    calls.push('k1Lock');

    return Promise.resolve();
  });
  const allocInsertMany = jest.fn((_tx: unknown, lines: readonly Record<string, unknown>[]) =>
    Promise.resolve(lines.map((line, i) => ({ id: `alloc-${i + 1}`, ...line }))),
  );
  const appInsert = jest.fn((_tx: unknown, row: Record<string, unknown>) => Promise.resolve({ id: 'app-1', ...row }));
  const service = new PurchaseInvoiceRecorderService(
    { lockOfRequest, applyInvoice } as unknown as CommitmentRepo,
    { insert, exists: jest.fn().mockResolvedValue(false) } as unknown as InvoiceRepo,
    { lock: jest.fn().mockResolvedValue(undefined) },
    { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
    {
      watch: jest.fn().mockResolvedValue({ pairs: [], usedBefore: new Map() }),
      settle: jest.fn().mockResolvedValue(0),
    } as unknown as ThresholdAlertService,
    { lockK1AllocationYears, insertMany: allocInsertMany } as unknown as InvoiceAllocationRepo,
    { insert: appInsert } as unknown as InvoiceYearApplicationRepo,
  );

  return { service, calls, lockOfRequest, applyInvoice, insert, lockK1AllocationYears, allocInsertMany, appInsert };
}

describe('PurchaseInvoiceRecorderService K1 annual (W3-23)', () => {
  it('acquires Tier 0 k1-allocation lock sorted ascending before reading commitments, splits 12 lines, and applies existing year commitment (K-A1, F9(a))', async () => {
    const c2026 = commitment({ id: 'c-2026', year: 2026, costCenterId: 'cc-a', amountMinor: 900_000n });
    const { service, calls, lockK1AllocationYears, applyInvoice, allocInsertMany, appInsert, insert } = build({
      commitments: [c2026],
    });

    const recorded = await service.record(
      TX,
      ACTOR,
      input({
        issuedOn: '2026-11-20',
        serviceMonth: '2026-11-01',
        netMinor: 5_400_000n,
        nonDeductibleTaxMinor: 540_000n,
        chargedCostCenterId: 'cc-a',
        k1Annual: { lockSubjectKey: 'asg-1' },
      }),
    );

    expect(lockK1AllocationYears).toHaveBeenCalledWith(TX, 'asg-1', [2026, 2027]);
    expect(calls.indexOf('k1Lock')).toBeLessThan(calls.indexOf('lock'));
    expect(applyInvoice).toHaveBeenCalledWith(TX, expect.objectContaining({ id: 'c-2026' }), {
      takeMinor: 900_000n,
      stateAfter: 'EXPENSED',
    });
    expect(allocInsertMany.mock.calls[0]?.[1]).toHaveLength(12);
    expect(appInsert).toHaveBeenCalledWith(TX, {
      invoiceId: 'inv-1',
      year: 2026,
      costCenterId: 'cc-a',
      commitmentId: 'c-2026',
      source: 'CONFIRMATION',
      appliedMinor: 900_000n,
      taxVarianceMinor: 90_000n,
    });
    expect(insert.mock.calls[0]?.[1]).toMatchObject({ commitmentId: 'c-2026', appliedMinor: 900_000n });
    expect(recorded).toMatchObject({ booking: 'COMMITMENT', appliedMinor: 900_000n, actualCostMinor: 5_940_000n });
  });

  it('applies both 2026 (900k + 90k taxVariance) and 2027 (4.500k + 450k taxVariance) when confirmed after 01/01', async () => {
    const c2026 = commitment({ id: 'c-2026', year: 2026, costCenterId: 'cc-a', amountMinor: 900_000n });
    const c2027 = commitment({ id: 'c-2027', year: 2027, costCenterId: 'cc-a', amountMinor: 4_500_000n });
    const { service, applyInvoice, appInsert, insert } = build({ commitments: [c2026, c2027] });

    const recorded = await service.record(
      TX,
      ACTOR,
      input({
        issuedOn: '2027-01-10',
        serviceMonth: '2026-11-01',
        netMinor: 5_400_000n,
        nonDeductibleTaxMinor: 540_000n,
        chargedCostCenterId: 'cc-a',
        k1Annual: { lockSubjectKey: 'asg-1' },
      }),
    );

    expect(applyInvoice).toHaveBeenCalledTimes(2);
    expect(appInsert).toHaveBeenCalledWith(TX, {
      invoiceId: 'inv-1',
      year: 2027,
      costCenterId: 'cc-a',
      commitmentId: 'c-2027',
      source: 'CONFIRMATION',
      appliedMinor: 4_500_000n,
      taxVarianceMinor: 450_000n,
    });
    expect(insert.mock.calls[0]?.[1]).toMatchObject({ appliedMinor: 5_400_000n });
    expect(recorded.appliedMinor).toBe(5_400_000n);
  });

  it('derives year 2 allocation months 11/2027..10/2028 from serviceMonth (F9(b), F9(d))', async () => {
    const c2027 = commitment({ id: 'c-2027', year: 2027, costCenterId: 'cc-a', amountMinor: 900_000n });
    const c2028 = commitment({ id: 'c-2028', year: 2028, costCenterId: 'cc-a', amountMinor: 4_500_000n });
    const { service, lockK1AllocationYears, allocInsertMany } = build({ commitments: [c2027, c2028] });

    await service.record(
      TX,
      ACTOR,
      input({
        issuedOn: '2028-02-01',
        serviceMonth: '2027-11-01',
        netMinor: 5_400_000n,
        nonDeductibleTaxMinor: 540_000n,
        chargedCostCenterId: 'cc-a',
        k1Annual: { lockSubjectKey: 'asg-1' },
      }),
    );

    expect(lockK1AllocationYears).toHaveBeenCalledWith(TX, 'asg-1', [2027, 2028]);
    const lines = allocInsertMany.mock.calls[0]?.[1] as Array<{ month: string }>;
    expect(lines[0]?.month).toBe('2027-11-01');
    expect(lines[11]?.month).toBe('2028-10-01');
  });

  it('assigns per-month Cost Centers when confirmed after transfer without creating offset rows', async () => {
    const months = [
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
      '2027-04-01',
      '2027-05-01',
      '2027-06-01',
      '2027-07-01',
      '2027-08-01',
      '2027-09-01',
      '2027-10-01',
    ];
    const { service, lockOfRequest, allocInsertMany, appInsert } = build();
    lockOfRequest.mockImplementation((_tx: unknown, reqId: string) =>
      Promise.resolve(
        reqId === 'req-1'
          ? [
              commitment({ id: 'c-old-2026', year: 2026, costCenterId: 'cc-a', amountMinor: 900_000n }),
              commitment({ id: 'c-old-2027', year: 2027, costCenterId: 'cc-a', amountMinor: 1_350_000n }),
            ]
          : [commitment({ id: 'c-new-2027', year: 2027, costCenterId: 'cc-b', amountMinor: 3_150_000n })],
      ),
    );

    await service.record(
      TX,
      ACTOR,
      input({
        requestId: 'req-1',
        serviceMonth: '2026-11-01',
        netMinor: 5_400_000n,
        nonDeductibleTaxMinor: 540_000n,
        chargedCostCenterId: 'cc-a',
        k1Annual: {
          lockSubjectKey: 'asg-1',
          monthAllocations: months.map((month) => ({
            month,
            costCenterId: month >= '2027-04-01' ? 'cc-b' : 'cc-a',
            requestId: month >= '2027-04-01' ? 'req-2' : 'req-1',
          })),
        },
      }),
    );

    const writtenLines = allocInsertMany.mock.calls[0]?.[1] as Array<{ kind: string; costCenterId: string }>;
    expect(writtenLines.every((l) => l.kind === 'ORIGINAL')).toBe(true);
    expect(writtenLines.filter((l) => l.costCenterId === 'cc-a')).toHaveLength(5);
    expect(writtenLines.filter((l) => l.costCenterId === 'cc-b')).toHaveLength(7);
    expect(appInsert).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        costCenterId: 'cc-a',
        year: 2027,
        appliedMinor: 1_350_000n,
        taxVarianceMinor: 135_000n,
      }),
    );
    expect(appInsert).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        costCenterId: 'cc-b',
        year: 2027,
        appliedMinor: 3_150_000n,
        taxVarianceMinor: 315_000n,
      }),
    );
  });
});
