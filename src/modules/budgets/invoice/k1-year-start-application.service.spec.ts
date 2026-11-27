import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CommitmentRepo } from '../budget/commitment.repo';
import type { InvoiceAllocationRepo, InvoiceAllocationRecord } from './invoice-allocation.repo';
import type { InvoiceYearApplicationRepo } from './invoice-year-application.repo';
import { K1YearStartApplicationService } from './k1-year-start-application.service';

const TX = {} as DbTx;

const alloc = (patch: Partial<InvoiceAllocationRecord> & { id: string; month: string }): InvoiceAllocationRecord => ({
  invoiceId: 'inv-1',
  amountMinor: 495_000n,
  taxPartMinor: 45_000n,
  bucket: 'COST_CENTER',
  costCenterId: 'cc-a',
  commitmentId: null,
  kind: 'ORIGINAL',
  adjustsAllocationId: null,
  createdAt: new Date('2026-11-20T00:00:00.000Z'),
  ...patch,
});

const commitment = (over: Record<string, unknown> = {}) => ({
  id: 'c-2027',
  requestId: 'req-1',
  year: 2027,
  organizationId: 'org-1',
  costCenterId: 'cc-a',
  amountMinor: 4_500_000n,
  releasedMinor: 0n,
  appliedMinor: 0n,
  currency: 'VND',
  state: 'HELD' as const,
  origin: 'YEAR_START' as const,
  seatMonthlyMinor: 450_000n,
  attachedVersionId: null,
  ...over,
});

describe('K1YearStartApplicationService (W3-23 K-A1, N3)', () => {
  it('sums existing 2027 allocations, inserts YEAR_START invoice_year_applications, and marks commitment EXPENSED', async () => {
    const allocs2027 = Array.from({ length: 10 }, (_, idx) =>
      alloc({ id: `a-${idx + 1}`, month: `2027-${String(idx + 1).padStart(2, '0')}-01` }),
    );
    const lockById = jest.fn().mockResolvedValue(commitment());
    const applyInvoice = jest.fn().mockResolvedValue(undefined);
    const ofInvoicesAlloc = jest.fn().mockResolvedValue(allocs2027);
    const ofInvoicesApp = jest.fn().mockResolvedValue([]);
    const insertApp = jest.fn().mockResolvedValue({ id: 'app-1' });

    const service = new K1YearStartApplicationService(
      { lockById, applyInvoice } as unknown as CommitmentRepo,
      { ofInvoices: ofInvoicesAlloc } as unknown as InvoiceAllocationRepo,
      { ofInvoices: ofInvoicesApp, insert: insertApp } as unknown as InvoiceYearApplicationRepo,
    );

    await service.applyYearStart(TX, {
      year: 2027,
      items: [{ requestId: 'req-1', commitmentId: 'c-2027', costCenterId: 'cc-a', invoiceIds: ['inv-1'] }],
    });

    expect(insertApp).toHaveBeenCalledWith(TX, {
      invoiceId: 'inv-1',
      year: 2027,
      costCenterId: 'cc-a',
      commitmentId: 'c-2027',
      source: 'YEAR_START',
      appliedMinor: 4_500_000n,
      taxVarianceMinor: 450_000n,
    });
    expect(applyInvoice).toHaveBeenCalledWith(TX, expect.objectContaining({ id: 'c-2027' }), {
      takeMinor: 4_500_000n,
      stateAfter: 'EXPENSED',
    });
  });

  it('applies N3 overlapping invoices sequentially (inv-1 990k + inv-2 4.410k with 540k taxVariance)', async () => {
    const inv1Lines = ['2027-01-01', '2027-02-01'].map((month, i) =>
      alloc({ id: `a1-${i}`, invoiceId: 'inv-1', month }),
    );
    const inv2Lines = Array.from({ length: 12 }, (_, i) =>
      alloc({ id: `a2-${i}`, invoiceId: 'inv-2', month: `2027-${String(i + 1).padStart(2, '0')}-01` }),
    );
    const lockById = jest.fn().mockResolvedValue(commitment({ amountMinor: 5_400_000n }));
    const applyInvoice = jest.fn().mockResolvedValue(undefined);
    const insertApp = jest.fn().mockResolvedValue({ id: 'app-x' });

    const service = new K1YearStartApplicationService(
      { lockById, applyInvoice } as unknown as CommitmentRepo,
      { ofInvoices: jest.fn().mockResolvedValue([...inv1Lines, ...inv2Lines]) } as unknown as InvoiceAllocationRepo,
      { ofInvoices: jest.fn().mockResolvedValue([]), insert: insertApp } as unknown as InvoiceYearApplicationRepo,
    );

    await service.applyYearStart(TX, {
      year: 2027,
      items: [{ requestId: 'req-1', commitmentId: 'c-2027', costCenterId: 'cc-a', invoiceIds: ['inv-1', 'inv-2'] }],
    });

    expect(insertApp).toHaveBeenNthCalledWith(1, TX, {
      invoiceId: 'inv-1',
      year: 2027,
      costCenterId: 'cc-a',
      commitmentId: 'c-2027',
      source: 'YEAR_START',
      appliedMinor: 990_000n,
      taxVarianceMinor: 0n,
    });
    expect(insertApp).toHaveBeenNthCalledWith(2, TX, {
      invoiceId: 'inv-2',
      year: 2027,
      costCenterId: 'cc-a',
      commitmentId: 'c-2027',
      source: 'YEAR_START',
      appliedMinor: 4_410_000n,
      taxVarianceMinor: 540_000n,
    });
    expect(applyInvoice).toHaveBeenCalledWith(TX, expect.objectContaining({ id: 'c-2027' }), {
      takeMinor: 5_400_000n,
      stateAfter: 'EXPENSED',
    });
  });
});
