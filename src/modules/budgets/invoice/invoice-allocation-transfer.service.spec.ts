import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CommitmentRepo } from '../budget/commitment.repo';
import type { InvoiceAllocationRepo, InvoiceAllocationRecord } from './invoice-allocation.repo';
import type { InvoiceYearApplicationRepo } from './invoice-year-application.repo';
import { InvoiceAllocationTransferService } from './invoice-allocation-transfer.service';

const TX = {} as DbTx;
const NOW = new Date('2027-03-20T08:00:00.000Z');

const alloc = (patch: Partial<InvoiceAllocationRecord> & { id: string; month: string }): InvoiceAllocationRecord => ({
  invoiceId: 'inv-1',
  amountMinor: 495_000n,
  taxPartMinor: 45_000n,
  bucket: 'COST_CENTER',
  costCenterId: 'cc-a',
  commitmentId: 'c-old-2027',
  kind: 'ORIGINAL',
  adjustsAllocationId: null,
  createdAt: new Date('2026-11-20T00:00:00.000Z'),
  ...patch,
});

const commitment = (over: Record<string, unknown> = {}) => ({
  id: 'c-old-2027',
  year: 2027,
  organizationId: 'org-1',
  costCenterId: 'cc-a',
  amountMinor: 4_500_000n,
  releasedMinor: 0n,
  appliedMinor: 4_500_000n,
  state: 'EXPENSED' as const,
  origin: 'YEAR_START' as const,
  seatMonthlyMinor: 450_000n,
  attachedVersionId: null,
  ...over,
});

describe('InvoiceAllocationTransferService (W3-23 F8, D-16)', () => {
  it('writes TRANSFER_OUT/TRANSFER_IN, updates invoice_year_applications, applies new commitment, and releases EXPENSED old commitment via D-16 (TRANSFER_EFFECTIVE)', async () => {
    const existing2027 = Array.from({ length: 10 }, (_, i) =>
      alloc({ id: `a-${i + 1}`, month: `2027-${String(i + 1).padStart(2, '0')}-01` }),
    );
    const lockK1AllocationYears = jest.fn().mockResolvedValue(undefined);
    const insertMany = jest.fn((_tx: unknown, lines: readonly Record<string, unknown>[]) =>
      Promise.resolve(
        lines.map((line, i) => ({
          id: `off-${i + 1}`,
          taxPartMinor: 0n,
          adjustsAllocationId: null,
          commitmentId: null,
          costCenterId: null,
          kind: 'TRANSFER_OUT',
          createdAt: NOW,
          ...line,
        })),
      ),
    );
    const insertApp = jest.fn().mockResolvedValue({ id: 'app-1' });
    const sumTransferNegativeOfCommitment = jest.fn().mockResolvedValue(3_150_000n);
    const oldCommit = commitment({
      state: 'EXPENSED',
      amountMinor: 4_500_000n,
      appliedMinor: 4_500_000n,
      transferReturnedMinor: 0n,
    });
    const newCommit = commitment({
      id: 'c-new-2027',
      costCenterId: 'cc-b',
      amountMinor: 3_150_000n,
      appliedMinor: 0n,
      state: 'HELD',
    });
    const lockOfRequest = jest.fn((_tx: unknown, reqId: string) =>
      Promise.resolve(reqId === 'req-old' ? [oldCommit] : [newCommit]),
    );
    const release = jest.fn().mockResolvedValue({ released: false, heldMinor: 0n });
    const releaseExpensedTransfer = jest.fn().mockResolvedValue(undefined);
    const applyInvoice = jest.fn().mockResolvedValue(undefined);

    const service = new InvoiceAllocationTransferService(
      { lockOfRequest, release, releaseExpensedTransfer, applyInvoice } as unknown as CommitmentRepo,
      {
        lockK1AllocationYears,
        ofInvoices: jest.fn().mockResolvedValue(existing2027),
        insertMany,
      } as unknown as InvoiceAllocationRepo,
      {
        ofInvoices: jest.fn().mockResolvedValue([
          {
            id: 'app-prior',
            invoiceId: 'inv-1',
            year: 2027,
            costCenterId: 'cc-a',
            commitmentId: 'c-old-2027',
            source: 'YEAR_START',
            appliedMinor: 4_500_000n,
            taxVarianceMinor: 450_000n,
            createdAt: new Date('2027-01-01T00:00:00.000Z'),
          },
        ]),
        insert: insertApp,
        sumTransferNegativeOfCommitment,
      } as unknown as InvoiceYearApplicationRepo,
    );

    const result = await service.transfer(TX, {
      lockSubjectKey: 'asg-1',
      invoiceIds: ['inv-1'],
      billingAnchorOn: '2026-11-05',
      endedOn: '2027-03-20',
      oldCostCenterId: 'cc-a',
      newCostCenterId: 'cc-b',
      oldRequestIds: ['req-old'],
      newRequestId: 'req-new',
      reference: 'transfer:regrant:assignment:asg-1',
      now: NOW,
    });

    expect(lockK1AllocationYears).toHaveBeenCalledWith(TX, 'asg-1', [2027, 2028]);
    expect(result.transferredMinor).toBe(3_465_000n);
    const written = insertMany.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    expect(written).toHaveLength(14);
    expect(written.filter((l) => l.kind === 'TRANSFER_OUT' && l.costCenterId === 'cc-a')).toHaveLength(7);
    expect(written.filter((l) => l.kind === 'TRANSFER_IN' && l.costCenterId === 'cc-b')).toHaveLength(7);
    expect(release).not.toHaveBeenCalled();
    // D-16: EXPENSED commitment decreases applied_minor and increases released_minor by unreflected TRANSFER sum d = 3_150_000n
    expect(sumTransferNegativeOfCommitment).toHaveBeenCalledWith(TX, 'c-old-2027');
    expect(releaseExpensedTransfer).toHaveBeenCalledWith(TX, expect.objectContaining({ id: 'c-old-2027' }), {
      transferMinor: 3_150_000n,
      reference: 'transfer:regrant:assignment:asg-1',
      now: NOW,
    });
    // New commitment receives 3.150.000 and transitions to EXPENSED
    expect(applyInvoice).toHaveBeenCalledWith(TX, expect.objectContaining({ id: 'c-new-2027' }), {
      takeMinor: 3_150_000n,
      stateAfter: 'EXPENSED',
    });
    expect(insertApp).toHaveBeenCalledWith(TX, {
      invoiceId: 'inv-1',
      year: 2027,
      costCenterId: 'cc-a',
      commitmentId: 'c-old-2027',
      source: 'TRANSFER',
      appliedMinor: -3_150_000n,
      taxVarianceMinor: -315_000n,
    });
    expect(insertApp).toHaveBeenCalledWith(TX, {
      invoiceId: 'inv-1',
      year: 2027,
      costCenterId: 'cc-b',
      commitmentId: 'c-new-2027',
      source: 'TRANSFER',
      appliedMinor: 3_150_000n,
      taxVarianceMinor: 315_000n,
    });
  });

  it('D-16: only reflects net delta d = -SUM(TRANSFER) - transferReturnedMinor on subsequent EXPENSED transfer', async () => {
    const existing2027 = Array.from({ length: 10 }, (_, i) =>
      alloc({ id: `a-${i + 1}`, month: `2027-${String(i + 1).padStart(2, '0')}-01` }),
    );
    const oldCommit = commitment({
      state: 'EXPENSED',
      amountMinor: 4_500_000n,
      appliedMinor: 3_500_000n,
      releasedMinor: 1_000_000n,
      transferReturnedMinor: 1_000_000n,
    });
    const releaseExpensedTransfer = jest.fn().mockResolvedValue(undefined);

    const service = new InvoiceAllocationTransferService(
      {
        lockOfRequest: jest.fn().mockResolvedValue([oldCommit]),
        release: jest.fn(),
        releaseExpensedTransfer,
        applyInvoice: jest.fn(),
      } as unknown as CommitmentRepo,
      {
        lockK1AllocationYears: jest.fn().mockResolvedValue(undefined),
        ofInvoices: jest.fn().mockResolvedValue(existing2027),
        insertMany: jest.fn((_tx: unknown, lines: readonly Record<string, unknown>[]) =>
          Promise.resolve(
            lines.map((line, i) => ({
              id: `off-${i + 1}`,
              taxPartMinor: 0n,
              adjustsAllocationId: null,
              commitmentId: null,
              costCenterId: null,
              kind: 'TRANSFER_OUT',
              createdAt: NOW,
              ...line,
            })),
          ),
        ),
      } as unknown as InvoiceAllocationRepo,
      {
        ofInvoices: jest.fn().mockResolvedValue([
          {
            id: 'app-prior',
            invoiceId: 'inv-1',
            year: 2027,
            costCenterId: 'cc-a',
            commitmentId: 'c-old-2027',
            source: 'YEAR_START',
            appliedMinor: 4_500_000n,
            taxVarianceMinor: 450_000n,
            createdAt: new Date('2027-01-01T00:00:00.000Z'),
          },
        ]),
        insert: jest.fn().mockResolvedValue({ id: 'app-1' }),
        sumTransferNegativeOfCommitment: jest.fn().mockResolvedValue(3_150_000n),
      } as unknown as InvoiceYearApplicationRepo,
    );

    await service.transfer(TX, {
      lockSubjectKey: 'asg-1',
      invoiceIds: ['inv-1'],
      billingAnchorOn: '2026-11-05',
      endedOn: '2027-03-20',
      oldCostCenterId: 'cc-a',
      newCostCenterId: 'cc-b',
      oldRequestIds: ['req-old'],
      newRequestId: null,
      reference: 'transfer:regrant:assignment:asg-1',
      now: NOW,
    });

    expect(releaseExpensedTransfer).toHaveBeenCalledWith(TX, expect.objectContaining({ id: 'c-old-2027' }), {
      transferMinor: 2_150_000n,
      reference: 'transfer:regrant:assignment:asg-1',
      now: NOW,
    });
  });

  it('D-16: still calls release(TRANSFER_EFFECTIVE) when old commitment is HELD with heldMinor > 0', async () => {
    const existing2027 = Array.from({ length: 10 }, (_, i) =>
      alloc({ id: `a-${i + 1}`, month: `2027-${String(i + 1).padStart(2, '0')}-01`, commitmentId: 'c-old-2027' }),
    );
    const oldCommit = commitment({ state: 'HELD', amountMinor: 4_500_000n, appliedMinor: 1_000_000n });
    const release = jest.fn().mockResolvedValue({ released: false, heldMinor: 350_000n });

    const service = new InvoiceAllocationTransferService(
      {
        lockOfRequest: jest.fn().mockResolvedValue([oldCommit]),
        release,
        applyInvoice: jest.fn(),
      } as unknown as CommitmentRepo,
      {
        lockK1AllocationYears: jest.fn().mockResolvedValue(undefined),
        ofInvoices: jest.fn().mockResolvedValue(existing2027),
        insertMany: jest.fn((_tx: unknown, lines: readonly Record<string, unknown>[]) =>
          Promise.resolve(
            lines.map((line, i) => ({
              id: `off-${i + 1}`,
              taxPartMinor: 0n,
              adjustsAllocationId: null,
              commitmentId: null,
              costCenterId: null,
              kind: 'TRANSFER_OUT',
              createdAt: NOW,
              ...line,
            })),
          ),
        ),
      } as unknown as InvoiceAllocationRepo,
      {
        ofInvoices: jest.fn().mockResolvedValue([]),
        insert: jest.fn().mockResolvedValue({ id: 'app-1' }),
      } as unknown as InvoiceYearApplicationRepo,
    );

    await service.transfer(TX, {
      lockSubjectKey: 'asg-1',
      invoiceIds: ['inv-1'],
      billingAnchorOn: '2026-11-05',
      endedOn: '2027-03-20',
      oldCostCenterId: 'cc-a',
      newCostCenterId: 'cc-b',
      oldRequestIds: ['req-old'],
      newRequestId: null,
      reference: 'transfer:regrant:assignment:asg-1',
      now: NOW,
    });

    expect(release).toHaveBeenCalledWith(TX, expect.objectContaining({ id: 'c-old-2027' }), {
      takeMinor: 3_150_000n,
      reason: 'TRANSFER_EFFECTIVE',
      reasonText: 'transfer:regrant:assignment:asg-1',
      releasedByEmployeeId: null,
      now: NOW,
    });
  });

  it('G-1 (D-16): HELD commitment with appliedMinor > 0 that transitions to EXPENSED after release runs transfer return in same call', async () => {
    const existing2027 = Array.from({ length: 10 }, (_, i) =>
      alloc({ id: `a-${i + 1}`, month: `2027-${String(i + 1).padStart(2, '0')}-01`, commitmentId: 'c-old-2027' }),
    );
    const oldCommit = commitment({
      state: 'HELD',
      amountMinor: 4_800_000n,
      appliedMinor: 4_500_000n,
      releasedMinor: 0n,
      transferReturnedMinor: 0n,
      seatMonthlyMinor: 450_000n,
    });
    const release = jest.fn().mockResolvedValue({ released: true, heldMinor: 0n });
    const releaseExpensedTransfer = jest.fn().mockResolvedValue(undefined);

    const service = new InvoiceAllocationTransferService(
      {
        lockOfRequest: jest.fn().mockResolvedValue([oldCommit]),
        release,
        releaseExpensedTransfer,
        applyInvoice: jest.fn(),
      } as unknown as CommitmentRepo,
      {
        lockK1AllocationYears: jest.fn().mockResolvedValue(undefined),
        ofInvoices: jest.fn().mockResolvedValue(existing2027),
        insertMany: jest.fn((_tx: unknown, lines: readonly Record<string, unknown>[]) =>
          Promise.resolve(
            lines.map((line, i) => ({
              id: `off-${i + 1}`,
              taxPartMinor: 0n,
              adjustsAllocationId: null,
              commitmentId: null,
              costCenterId: null,
              kind: 'TRANSFER_OUT',
              createdAt: NOW,
              ...line,
            })),
          ),
        ),
      } as unknown as InvoiceAllocationRepo,
      {
        ofInvoices: jest.fn().mockResolvedValue([
          {
            id: 'app-prior',
            invoiceId: 'inv-1',
            year: 2027,
            costCenterId: 'cc-a',
            commitmentId: 'c-old-2027',
            source: 'YEAR_START',
            appliedMinor: 4_500_000n,
            taxVarianceMinor: 450_000n,
            createdAt: new Date('2027-01-01T00:00:00.000Z'),
          },
        ]),
        insert: jest.fn().mockResolvedValue({ id: 'app-1' }),
        sumTransferNegativeOfCommitment: jest.fn().mockResolvedValue(3_150_000n),
      } as unknown as InvoiceYearApplicationRepo,
    );

    await service.transfer(TX, {
      lockSubjectKey: 'asg-1',
      invoiceIds: ['inv-1'],
      billingAnchorOn: '2026-11-05',
      endedOn: '2027-03-20',
      oldCostCenterId: 'cc-a',
      newCostCenterId: 'cc-b',
      oldRequestIds: ['req-old'],
      newRequestId: null,
      reference: 'transfer:regrant:assignment:asg-1',
      now: NOW,
    });

    expect(release).toHaveBeenCalledWith(TX, expect.objectContaining({ id: 'c-old-2027' }), {
      takeMinor: 300_000n,
      reason: 'TRANSFER_EFFECTIVE',
      reasonText: 'transfer:regrant:assignment:asg-1',
      releasedByEmployeeId: null,
      now: NOW,
    });
    expect(releaseExpensedTransfer).toHaveBeenCalledWith(TX, expect.objectContaining({ id: 'c-old-2027' }), {
      transferMinor: 3_150_000n,
      reference: 'transfer:regrant:assignment:asg-1',
      now: NOW,
    });
    expect(oldCommit).toMatchObject({
      state: 'EXPENSED',
      appliedMinor: 1_350_000n,
      releasedMinor: 3_450_000n,
      transferReturnedMinor: 3_150_000n,
    });
  });
});
