import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import { Prisma } from '../../../generated/prisma/client';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import {
  BudgetCommitmentNotFoundError,
  InvoiceCommitmentReleasedError,
  InvoiceDuplicateError,
  InvoiceVendorUnknownError,
} from '../budget/budget.errors';
import type { BudgetFactsService } from '../budget/budget-facts.service';
import type { CommitmentRepo } from '../budget/commitment.repo';
import type { InvoiceRecord, InvoiceRepo } from '../budget/invoice.repo';
import type { CommitmentService } from '../commitment/commitment.service';
import {
  CommitmentRequestFactsHook,
  PurchaseInvoiceFactsHook,
  type CommitmentRequestView,
  type PurchaseInvoiceFactsView,
} from '../public/budgets.extension-points';
import type { InvoiceBodyDto } from './invoice.dto';
import { InvoiceService } from './invoice.service';

const ACTOR = { employeeId: 'finance-1', appUserId: 'u-1', roles: ['FINANCE'] } as unknown as AuthenticatedPrincipal;
const COMMITMENT = 'c-1';

const row = (over: Record<string, unknown> = {}) => ({
  id: COMMITMENT,
  requestId: 'req-1',
  organizationId: 'org-1',
  costCenterId: 'cc-1',
  year: 2027,
  currency: 'VND',
  amountMinor: 20_000n,
  releasedMinor: 0n,
  appliedMinor: 0n,
  state: 'HELD' as const,
  ...over,
});
const body = (over: Partial<InvoiceBodyDto> = {}): InvoiceBodyDto => ({
  number: 'INV-1',
  issuedOn: '2027-01-05',
  netAmount: { amount: '12000' },
  ...over,
});
const view = (over: Partial<CommitmentRequestView> = {}): CommitmentRequestView => ({
  id: 'req-1',
  software: { name: 'Figma' },
  plan: { name: 'Team' },
  requester: { employeeCode: 'NV-1', fullName: 'An' },
  beneficiaryCount: 1,
  spendApprovedAt: null,
  vendorId: 'vendor-1',
  ...over,
});

function build(
  opts: {
    row?: ReturnType<typeof row> | null;
    view?: CommitmentRequestView | null;
    exists?: boolean;
    pageRows?: InvoiceRecord[];
    purchaseFacts?: Map<string, PurchaseInvoiceFactsView>;
  } = {},
) {
  const calls: string[] = [];
  const lockById = jest.fn(() => {
    calls.push('lock');

    return Promise.resolve(opts.row === undefined ? row() : opts.row);
  });
  const applyInvoice = jest.fn(() => {
    calls.push('apply');

    return Promise.resolve();
  });
  const insert = jest.fn((_tx: unknown, input: Record<string, unknown>) => {
    calls.push('insert');

    return Promise.resolve({
      id: 'inv-1',
      commitmentId: COMMITMENT,
      number: input.number,
      issuedOn: input.issuedOn,
      currency: input.currency,
      netMinor: input.netMinor,
      deductibleTaxMinor: input.deductibleTaxMinor,
      nonDeductibleTaxMinor: input.nonDeductibleTaxMinor,
      actualCostMinor: input.actualCostMinor,
      matchResult: input.matchResult,
      note: input.note,
      recordedByEmployeeId: input.recordedByEmployeeId,
      recordedAt: new Date('2027-01-06T01:00:00.000Z'),
      serviceMonth: null,
      purchaseInvoiceId: null,
    } as InvoiceRecord);
  });
  const exists = jest.fn().mockResolvedValue(opts.exists ?? false);
  const record = jest.fn(() => {
    calls.push('audit');

    return Promise.resolve();
  });
  const moneyIn = jest.fn((input: { amount: string }) => Promise.resolve(BigInt(input.amount)));
  const hook = new CommitmentRequestFactsHook();
  const factsOf = jest.fn(() =>
    Promise.resolve(opts.view === null ? new Map() : new Map([['req-1', opts.view ?? view()]])),
  );
  hook.bind({ factsOf });
  const page = jest.fn().mockResolvedValue({ items: [{ id: COMMITMENT, state: 'HELD' }] });
  const purchaseHook = new PurchaseInvoiceFactsHook();
  const purchaseFactsOf = jest.fn(() => Promise.resolve(opts.purchaseFacts ?? new Map()));
  purchaseHook.bind({ factsOf: purchaseFactsOf });
  const rows = opts.pageRows ?? [];
  const service = new InvoiceService(
    { run: (fn: (tx: unknown) => unknown) => fn({}) } as unknown as TransactionRunner,
    { lockById, applyInvoice, exists: jest.fn().mockResolvedValue(true) } as unknown as CommitmentRepo,
    {
      insert,
      exists,
      netRecorded: jest.fn().mockResolvedValue(0n),
      page: jest.fn().mockResolvedValue({ rows, total: rows.length }),
    } as unknown as InvoiceRepo,
    {
      moneyIn,
      people: jest
        .fn()
        .mockResolvedValue(new Map([['finance-1', { employeeId: 'finance-1', employeeCode: 'F', fullName: 'Fin' }]])),
      formatter: jest.fn().mockResolvedValue((minor: bigint) => ({ amount: minor.toString(), currency: 'VND' })),
    } as unknown as BudgetFactsService,
    { record } as unknown as AuditApi,
    hook,
    { page } as unknown as CommitmentService,
    purchaseHook,
  );

  return { service, calls, lockById, applyInvoice, insert, exists, moneyIn, factsOf, record, purchaseFactsOf };
}

describe('InvoiceService.record', () => {
  it('locks the commitment first, then writes the invoice, takes the commitment down and audits, in that order', async () => {
    const { service, calls } = build();

    await service.record(ACTOR, COMMITMENT, body());

    expect(calls).toEqual(['lock', 'insert', 'apply', 'audit']);
  });

  it('records the vendor of the request and the currency of the commitment, never one from the client', async () => {
    const { service, insert, moneyIn } = build();

    await service.record(ACTOR, COMMITMENT, body());

    expect(insert.mock.calls[0][1]).toMatchObject({
      vendorId: 'vendor-1',
      currency: 'VND',
      organizationId: 'org-1',
      commitmentId: COMMITMENT,
      recordedByEmployeeId: 'finance-1',
    });
    expect(moneyIn).toHaveBeenCalledWith({ amount: '12000' }, 'VND', {});
  });

  it('costs the price and the tax that cannot be deducted, keeps the tax that can apart, and takes the commitment down by the price', async () => {
    const { service, insert, applyInvoice } = build();

    const result = await service.record(
      ACTOR,
      COMMITMENT,
      body({ deductibleTax: { amount: '1200' }, nonDeductibleTax: { amount: '600' } }),
    );

    expect(insert.mock.calls[0][1]).toMatchObject({
      netMinor: 12_000n,
      deductibleTaxMinor: 1_200n,
      nonDeductibleTaxMinor: 600n,
      actualCostMinor: 12_600n,
      appliedMinor: 12_000n,
      matchResult: 'TAX_ONLY',
    });
    expect(applyInvoice).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ id: COMMITMENT }),
      expect.objectContaining({ takeMinor: 12_000n, stateAfter: 'HELD' }),
    );
    expect(result.invoice).toMatchObject({
      actualCost: { amount: '12600' },
      deductibleTax: { amount: '1200' },
      matchResult: 'TAX_ONLY',
      recordedBy: { employeeCode: 'F' },
    });
    expect(result.commitment).toMatchObject({ id: COMMITMENT });
  });

  it('writes an audit event that names the invoice, the commitment and what it cost', async () => {
    const { service, record } = build();

    await service.record(ACTOR, COMMITMENT, body({ nonDeductibleTax: { amount: '600' } }));

    expect(record).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        action: 'INVOICE.RECORDED',
        resourceType: 'INVOICE',
        resourceId: 'inv-1',
        after: expect.objectContaining({
          commitmentId: COMMITMENT,
          actualCostMinor: '12600',
          appliedMinor: '12000',
        }) as unknown,
      }),
    );
  });

  describe('what it refuses, writing nothing', () => {
    it('refuses a commitment that does not exist', async () => {
      const { service, insert } = build({ row: null });

      await expect(service.record(ACTOR, COMMITMENT, body())).rejects.toBeInstanceOf(BudgetCommitmentNotFoundError);
      expect(insert).not.toHaveBeenCalled();
    });

    it.each([
      ['a request that cannot be read', null],
      ['software with no vendor', view({ vendorId: null })],
    ])('refuses %s as a vendor it cannot tell', async (_name, found) => {
      const { service, insert } = build({ view: found });

      await expect(service.record(ACTOR, COMMITMENT, body())).rejects.toBeInstanceOf(InvoiceVendorUnknownError);
      expect(insert).not.toHaveBeenCalled();
    });

    it('refuses a commitment that was released', async () => {
      const { service, insert } = build({ row: row({ state: 'RELEASED', releasedMinor: 20_000n }) });

      await expect(service.record(ACTOR, COMMITMENT, body())).rejects.toBeInstanceOf(InvoiceCommitmentReleasedError);
      expect(insert).not.toHaveBeenCalled();
    });

    it.each([
      ['a price of nothing', body({ netAmount: { amount: '0' } })],
      ['a negative price', body({ netAmount: { amount: '-5' } })],
      ['a negative deductible tax', body({ deductibleTax: { amount: '-1' } })],
      ['a negative tax that cannot be deducted', body({ nonDeductibleTax: { amount: '-1' } })],
    ])('refuses %s as an amount out of range', async (_name, input) => {
      const { service, insert } = build();

      await expect(service.record(ACTOR, COMMITMENT, input)).rejects.toBeInstanceOf(MoneyOutOfRangeError);
      expect(insert).not.toHaveBeenCalled();
    });

    it('refuses a number the vendor used already', async () => {
      const { service, insert } = build({ exists: true });

      await expect(service.record(ACTOR, COMMITMENT, body())).rejects.toBeInstanceOf(InvoiceDuplicateError);
      expect(insert).not.toHaveBeenCalled();
    });

    it('tells the one that loses a race at the unique index that the number is taken', async () => {
      const { service, insert, applyInvoice } = build();
      insert.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
      );

      await expect(service.record(ACTOR, COMMITMENT, body())).rejects.toBeInstanceOf(InvoiceDuplicateError);
      expect(applyInvoice).not.toHaveBeenCalled();
    });

    it('lets any other failure of the write through as it is', async () => {
      const { service, insert } = build();
      insert.mockRejectedValueOnce(new Error('connection lost'));

      await expect(service.record(ACTOR, COMMITMENT, body())).rejects.toThrow('connection lost');
    });
  });
});

const stored = (id: string, over: Partial<InvoiceRecord> = {}): InvoiceRecord => ({
  id,
  commitmentId: COMMITMENT,
  number: `N-${id}`,
  issuedOn: '2027-01-05',
  currency: 'VND',
  netMinor: 1_000n,
  deductibleTaxMinor: 0n,
  nonDeductibleTaxMinor: 0n,
  actualCostMinor: 1_000n,
  matchResult: 'MATCHED',
  note: null,
  recordedByEmployeeId: 'finance-1',
  recordedAt: new Date('2027-01-06T01:00:00.000Z'),
  serviceMonth: null,
  purchaseInvoiceId: null,
  ...over,
});

describe('InvoiceService.page (PI-1.7)', () => {
  it('adds the month it pays for, its label and how it was paid to an invoice of a purchase, reading the purchases of the page once', async () => {
    const { service, purchaseFactsOf } = build({
      pageRows: [
        stored('a', { serviceMonth: '2027-03-01', purchaseInvoiceId: 'p-1' }),
        stored('b', { serviceMonth: '2027-04-01', purchaseInvoiceId: 'p-2' }),
      ],
      purchaseFacts: new Map([
        ['p-1', { label: 'NEW_PURCHASE', paymentSource: 'COMPANY_CARD' }],
        ['p-2', { label: 'PERIOD', paymentSource: 'IT_ADVANCE' }],
      ]),
    });

    const page = await service.page(COMMITMENT, { page: 1, pageSize: 20 });

    expect(page.items).toMatchObject([
      { id: 'a', servicePeriodMonth: '2027-03', label: 'NEW_PURCHASE', paymentSource: 'COMPANY_CARD' },
      { id: 'b', servicePeriodMonth: '2027-04', label: 'PERIOD', paymentSource: 'IT_ADVANCE' },
    ]);
    expect(purchaseFactsOf).toHaveBeenCalledTimes(1);
    expect(purchaseFactsOf).toHaveBeenCalledWith(['p-1', 'p-2']);
  });

  it('leaves the three empty for an invoice that is not of a purchase, and does not ask for purchases when the page holds none', async () => {
    const { service, purchaseFactsOf } = build({ pageRows: [stored('old')] });

    const page = await service.page(COMMITMENT, { page: 1, pageSize: 20 });

    expect(page.items[0]).toMatchObject({ servicePeriodMonth: null, label: null, paymentSource: null });
    expect(purchaseFactsOf).not.toHaveBeenCalled();
  });

  it('keeps the month and leaves label and way of payment empty for a purchase the requests cannot tell about', async () => {
    const { service } = build({
      pageRows: [stored('lost', { serviceMonth: '2027-05-01', purchaseInvoiceId: 'p-gone' })],
    });

    const page = await service.page(COMMITMENT, { page: 1, pageSize: 20 });

    expect(page.items[0]).toMatchObject({ servicePeriodMonth: '2027-05', label: null, paymentSource: null });
  });
});
