import type { BudgetsApi } from '../../budgets/public/budgets.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { BatchListRow, SpendBatchRepo } from '../spend/spend-batch.repo';
import type { SpendWireViewService } from '../spend/spend-wire-view.service';
import { SpendBatchListService } from './spend-batch-list.service';

const DEPARTMENT = '0a1b2c3d-0000-4000-8000-0000000000d1';
const SUBMITTER = '0a1b2c3d-0000-4000-8000-0000000000e1';
const SENT_AT = new Date('2026-11-05T02:00:00.000Z');

type Item = BatchListRow['items'][number];
const item = (requestId: string, over: Partial<Item> = {}): Item => ({
  requestId,
  outcome: 'SENT_TO_APPROVER',
  leftAt: null,
  ...over,
});
const batch = (id: string, items: Item[]): BatchListRow => ({
  id,
  departmentId: DEPARTMENT,
  submittedByEmployeeId: SUBMITTER,
  submittedAt: SENT_AT,
  items,
});

function build(
  rows: BatchListRow[],
  committed: { requestId: string; amountMinor: bigint; currency: string }[],
  decided: string[] = [],
  total = rows.length,
) {
  const pageForFinance = jest.fn().mockResolvedValue({ rows, decided: new Set(decided), total });
  const committedByRequests = jest.fn().mockResolvedValue(committed);
  const getDepartmentBriefs = jest.fn().mockResolvedValue([{ id: DEPARTMENT, code: 'ENG', name: 'Engineering' }]);
  const people = jest
    .fn()
    .mockResolvedValue(new Map([[SUBMITTER, { employeeId: SUBMITTER, employeeCode: 'NV-1', fullName: 'An Nguyen' }]]));
  const units = jest.fn().mockResolvedValue(
    new Map([
      ['VND', 0],
      ['USD', 2],
    ]),
  );
  const service = new SpendBatchListService(
    { pageForFinance } as unknown as SpendBatchRepo,
    { committedByRequests } as unknown as BudgetsApi,
    { getDepartmentBriefs } as unknown as OrganizationReadApi,
    { people, units } as unknown as SpendWireViewService,
  );

  return { service, pageForFinance, committedByRequests, getDepartmentBriefs };
}

describe('SpendBatchListService.page', () => {
  it('counts approved requests, adds what they were committed for by currency, and leaves the rest as pending', async () => {
    const { service } = build(
      [batch('b1', [item('r1'), item('r2'), item('r3'), item('r4')])],
      [
        { requestId: 'r1', amountMinor: 1_000n, currency: 'VND' },
        { requestId: 'r2', amountMinor: 2_500n, currency: 'VND' },
        { requestId: 'r2', amountMinor: 500n, currency: 'VND' },
      ],
      ['r3'],
    );

    const { items } = await service.page({ page: 1, pageSize: 20 });

    // r1, r2 hold commitments (r2 for two years); r3 was refused; r4 waits.
    expect(items[0]).toMatchObject({
      id: 'b1',
      itemCount: 4,
      approvedCount: 2,
      pendingCount: 1,
      approvedAmounts: { VND: '4000' },
      department: { id: DEPARTMENT, name: 'Engineering' },
      submittedBy: { employeeCode: 'NV-1' },
      submittedAt: '2026-11-05T02:00:00.000Z',
    });
  });

  it('keeps the currencies apart and writes each with its own minor units', async () => {
    const { service } = build(
      [batch('b1', [item('r1'), item('r2')])],
      [
        { requestId: 'r1', amountMinor: 1_000n, currency: 'VND' },
        { requestId: 'r2', amountMinor: 12_345n, currency: 'USD' },
      ],
    );

    const { items } = await service.page({ page: 1, pageSize: 20 });

    expect(items[0].approvedAmounts).toEqual({ VND: '1000', USD: '123.45' });
  });

  it('counts a stopped request and a request that left the batch as neither approved nor pending', async () => {
    const { service } = build(
      [
        batch('b1', [
          item('stopped', { outcome: 'STOPPED' }),
          item('returned', { leftAt: SENT_AT }),
          item('left-but-held', { leftAt: SENT_AT }),
          item('waits'),
        ]),
      ],
      [{ requestId: 'left-but-held', amountMinor: 700n, currency: 'VND' }],
    );

    const { items } = await service.page({ page: 1, pageSize: 20 });

    expect(items[0]).toMatchObject({ itemCount: 4, approvedCount: 0, pendingCount: 1, approvedAmounts: {} });
  });

  it('reads the commitments and the departments of the whole page once, whatever the number of batches', async () => {
    const rows = Array.from({ length: 20 }, (_, index) => batch(`b${index}`, [item(`r${index}a`), item(`r${index}b`)]));
    const { service, pageForFinance, committedByRequests, getDepartmentBriefs } = build(rows, []);

    const result = await service.page({ page: 1, pageSize: 20 });

    expect(result.items).toHaveLength(20);
    expect(pageForFinance).toHaveBeenCalledTimes(1);
    expect(committedByRequests).toHaveBeenCalledTimes(1);
    expect(committedByRequests).toHaveBeenCalledWith(expect.arrayContaining(['r0a', 'r19b']));
    expect((committedByRequests.mock.calls as string[][][])[0][0]).toHaveLength(40);
    expect(getDepartmentBriefs).toHaveBeenCalledTimes(1);
  });

  it('turns the window into instants and the page into a skip, and reports the total', async () => {
    const { service, pageForFinance } = build([batch('b1', [item('r1')])], [], [], 41);

    const result = await service.page({
      departmentId: DEPARTMENT,
      submittedFrom: '2026-11-01T00:00:00.000Z',
      submittedTo: '2026-11-06T00:00:00.000Z',
      page: 3,
      pageSize: 20,
    });

    expect(pageForFinance).toHaveBeenCalledWith({
      departmentId: DEPARTMENT,
      submittedFrom: new Date('2026-11-01T00:00:00.000Z'),
      submittedTo: new Date('2026-11-06T00:00:00.000Z'),
      skip: 40,
      take: 20,
    });
    expect(result.pagination).toEqual({ page: 3, pageSize: 20, totalItems: 41, totalPages: 3 });
  });
});
