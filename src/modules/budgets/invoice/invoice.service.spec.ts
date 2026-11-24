import type { BudgetFactsService } from '../budget/budget-facts.service';
import { BudgetCommitmentNotFoundError } from '../budget/budget.errors';
import type { CommitmentRepo } from '../budget/commitment.repo';
import type { InvoiceRecord, InvoiceRepo } from '../budget/invoice.repo';
import { PurchaseInvoiceFactsHook, type PurchaseInvoiceFactsView } from '../public/budgets.extension-points';
import { InvoiceService } from './invoice.service';

const COMMITMENT = 'c-1';

function build(
  opts: { exists?: boolean; pageRows?: InvoiceRecord[]; purchaseFacts?: Map<string, PurchaseInvoiceFactsView> } = {},
) {
  const purchaseHook = new PurchaseInvoiceFactsHook();
  const purchaseFactsOf = jest.fn(() => Promise.resolve(opts.purchaseFacts ?? new Map()));
  purchaseHook.bind({ factsOf: purchaseFactsOf });
  const rows = opts.pageRows ?? [];
  const service = new InvoiceService(
    { exists: jest.fn().mockResolvedValue(opts.exists ?? true) } as unknown as CommitmentRepo,
    { page: jest.fn().mockResolvedValue({ rows, total: rows.length }) } as unknown as InvoiceRepo,
    {
      people: jest
        .fn()
        .mockResolvedValue(new Map([['finance-1', { employeeId: 'finance-1', employeeCode: 'F', fullName: 'Fin' }]])),
      formatter: jest.fn().mockResolvedValue((minor: bigint) => ({ amount: minor.toString(), currency: 'VND' })),
    } as unknown as BudgetFactsService,
    purchaseHook,
  );

  return { service, purchaseFactsOf };
}

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
  poolExpectedMinor: null,
  poolVarianceMinor: null,
  poolVarianceMonth: null,
  poolVarianceInReview: false,
  ...over,
});

describe('InvoiceService.page (PI-1.7)', () => {
  it('says the commitment does not exist when it does not, and reads nothing of its invoices', async () => {
    const { service, purchaseFactsOf } = build({ exists: false });

    await expect(service.page(COMMITMENT, { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(
      BudgetCommitmentNotFoundError,
    );
    expect(purchaseFactsOf).not.toHaveBeenCalled();
  });

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
