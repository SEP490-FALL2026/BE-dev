import type { AuditApi } from '../../audit/public/audit.api';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { BudgetFactsService } from '../budget/budget-facts.service';
import type { CommitmentRepo } from '../budget/commitment.repo';
import type { InvoiceFigures, InvoiceRepo } from '../budget/invoice.repo';
import {
  CommitmentReleaseGuardHook,
  CommitmentRequestFactsHook,
  type CommitmentRequestView,
} from '../public/budgets.extension-points';
import { CommitmentService } from './commitment.service';

const COST_CENTER = '0a1b2c3d-0000-4000-8000-000000000001';

const commitmentRow = (index: number, state: 'HELD' | 'RELEASED' | 'EXPENSED' = 'HELD') => ({
  id: `c-${index}`,
  requestId: `req-${index}`,
  costCenterId: COST_CENTER,
  year: 2027,
  amountMinor: 1000n,
  releasedMinor: 0n,
  appliedMinor: 0n,
  currency: 'VND',
  state,
  attachedVersionId: 'v-1',
  attachedAt: new Date('2027-01-02T00:00:00.000Z'),
  unattachedReason: null,
  createdAt: new Date('2027-01-02T00:00:00.000Z'),
});

const viewOf = (requestId: string): CommitmentRequestView => ({
  id: requestId,
  software: { name: 'Figma' },
  plan: { name: 'Team' },
  requester: { employeeCode: 'NV-1', fullName: 'An Nguyen' },
  beneficiaryCount: 2,
  spendApprovedAt: new Date('2027-01-01T08:00:00.000Z'),
  vendorId: 'vendor-1',
});

function build(
  rows: ReturnType<typeof commitmentRow>[],
  known: (id: string) => boolean = () => true,
  figures: Record<string, InvoiceFigures> = {},
) {
  const page = jest.fn().mockResolvedValue({ rows, total: rows.length });
  const factsOf = jest.fn((ids: readonly string[]) =>
    Promise.resolve(new Map(ids.filter(known).map((id) => [id, viewOf(id)]))),
  );
  const figuresOf = jest.fn((ids: readonly string[]) =>
    Promise.resolve(new Map(ids.flatMap((id) => (figures[id] ? [[id, figures[id]] as const] : [])))),
  );
  const requestFacts = new CommitmentRequestFactsHook();
  requestFacts.bind({ factsOf });
  const service = new CommitmentService(
    {} as TransactionRunner,
    { page } as unknown as CommitmentRepo,
    {
      costCenters: jest
        .fn()
        .mockResolvedValue(new Map([[COST_CENTER, { id: COST_CENTER, code: 'ENG', name: 'Engineering' }]])),
      formatter: jest.fn().mockResolvedValue((minor: bigint) => ({ amount: minor.toString(), currency: 'VND' })),
    } as unknown as BudgetFactsService,
    {} as AuditApi,
    new CommitmentReleaseGuardHook(),
    requestFacts,
    { figuresOf } as unknown as InvoiceRepo,
  );

  return { service, page, factsOf, figuresOf };
}

describe('CommitmentService.page', () => {
  it('asks for the requests of a page of 50 commitments once, not once for each', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => commitmentRow(index));
    const { service, factsOf } = build(rows);

    const result = await service.page({ page: 1, pageSize: 100 });

    expect(result.items).toHaveLength(50);
    expect(factsOf).toHaveBeenCalledTimes(1);
    expect(factsOf.mock.calls[0][0]).toHaveLength(50);
  });

  it('asks for a request once when it holds a commitment for more than one year', async () => {
    const rows = [commitmentRow(1), { ...commitmentRow(1), id: 'c-1b', year: 2028 }];
    const { service, factsOf } = build(rows);

    await service.page({ page: 1, pageSize: 20 });

    expect(factsOf).toHaveBeenCalledWith(['req-1']);
  });

  it('shows the request on each commitment, and nothing for one that cannot be read', async () => {
    const { service } = build([commitmentRow(1), commitmentRow(2)], (id) => id === 'req-1');

    const { items } = await service.page({ page: 1, pageSize: 20 });

    expect(items[0].request).toEqual({
      id: 'req-1',
      software: { name: 'Figma' },
      plan: { name: 'Team' },
      requester: { employeeCode: 'NV-1', fullName: 'An Nguyen' },
      beneficiaryCount: 2,
      spendApprovedAt: '2027-01-01T08:00:00.000Z',
    });
    expect(items[1].request).toBeNull();
  });

  it('does not ask for any request when there is no commitment', async () => {
    const { service, factsOf } = build([]);

    const result = await service.page({ page: 1, pageSize: 20 });

    expect(result.items).toEqual([]);
    expect(factsOf).not.toHaveBeenCalled();
  });

  it('passes the state to the repository so that the list is narrowed by it', async () => {
    const { service, page } = build([commitmentRow(1)]);

    await service.page({ state: 'HELD', page: 2, pageSize: 10 });

    expect(page).toHaveBeenCalledWith(expect.objectContaining({ state: 'HELD', skip: 10, take: 10 }));
  });

  it('reads the invoices of the whole page once, and shows what they cost, how many there are and the flag', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => commitmentRow(index));
    const { service, figuresOf } = build(rows, () => true, {
      'c-0': { costMinor: 1_050n, count: 2, flagged: true },
      'c-1': { costMinor: 300n, count: 1, flagged: false },
    });

    const { items } = await service.page({ page: 1, pageSize: 100 });

    expect(figuresOf).toHaveBeenCalledTimes(1);
    expect(figuresOf.mock.calls[0][0]).toHaveLength(50);
    expect(items[0]).toMatchObject({ invoiced: { amount: '1050' }, invoiceCount: 2, hasDiscrepancy: true });
    expect(items[1]).toMatchObject({ invoiced: { amount: '300' }, invoiceCount: 1, hasDiscrepancy: false });
    expect(items[2]).toMatchObject({ invoiced: { amount: '0' }, invoiceCount: 0, hasDiscrepancy: false });
  });

  it('holds the amount less what went back and what became an expense, and nothing once it is not held', async () => {
    const held = { ...commitmentRow(1), releasedMinor: 100n, appliedMinor: 300n };
    const expensed = { ...commitmentRow(2, 'EXPENSED'), releasedMinor: 100n, appliedMinor: 900n };
    const released = { ...commitmentRow(3, 'RELEASED'), releasedMinor: 1000n };
    const { service } = build([held, expensed, released]);

    const { items } = await service.page({ page: 1, pageSize: 20 });

    expect(items.map((item) => [item.state, item.held.amount, item.released.amount])).toEqual([
      ['HELD', '600', '100'],
      ['EXPENSED', '0', '100'],
      ['RELEASED', '0', '1000'],
    ]);
  });
});
