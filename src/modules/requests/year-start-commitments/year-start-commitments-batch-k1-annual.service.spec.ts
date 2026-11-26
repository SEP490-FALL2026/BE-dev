import type { GrantedSeatOfRequest } from '../../licensing/public/licensing-open-grants.types';
import { YearStartCommitmentsBatchService, type YearStartPassContext } from './year-start-commitments-batch.service';
import type { YearStartCandidate } from './year-start-commitments.repo';

const tx = { tx: true };
const PASS: YearStartPassContext = { organizationId: 'org-1', year: 2027, now: new Date(), today: '2027-01-05' };

const candidate = (patch: Partial<YearStartCandidate> & { id: string }): YearStartCandidate => ({
  type: 'GRANT',
  state: 'COMPLETED',
  planId: 'plan-k1',
  departmentId: 'dep-request',
  expectedEndDate: null,
  termMonths: 12,
  budgetYear: 2026,
  nextYearAmountMinor: 4_500_000n,
  amountCurrency: 'VND',
  unitPriceMinor: 450_000n,
  billingCycle: 'MONTHLY',
  ...patch,
});

const heldSeat = (patch: Partial<GrantedSeatOfRequest> & { requestId: string }): GrantedSeatOfRequest => ({
  rootAssignmentId: `root-${patch.requestId}`,
  laterAssignmentIds: [],
  assignmentId: `root-${patch.requestId}`,
  employeeId: 'e-1',
  planId: 'plan-k1',
  owningDepartmentId: 'dep-request',
  expectedEndDate: null,
  validUntil: null,
  ...patch,
});

function setup(candidates: YearStartCandidate[], seats: GrantedSeatOfRequest[] = []) {
  const order: string[] = [];
  const confirmedInvoiceIdsByRequests = jest.fn().mockResolvedValue(new Map());
  const replacedAssignments = jest.fn().mockResolvedValue([]);
  const renewalRequestIdsByAssignments = jest.fn().mockResolvedValue([]);
  const repo = {
    lockBatch: jest.fn().mockResolvedValue(candidates),
    unclaimedSeats: jest.fn().mockResolvedValue(new Map()),
    keptNextYearOfLines: jest.fn().mockResolvedValue(new Map()),
    foreignKeptNextYearOfLines: jest.fn().mockResolvedValue([]),
    renewalSuccessors: jest.fn().mockResolvedValue([]),
    replacedAssignments,
    renewalRequestIdsByAssignments,
    renewalsThatBegan: jest.fn().mockResolvedValue(new Map()),
    confirmedInvoiceIdsByRequests,
  };
  const lockK1AllocationYears = jest.fn(() => {
    order.push('k1Lock');

    return Promise.resolve();
  });
  const listRequestsHoldingYear = jest.fn(() => {
    order.push('listHolding');

    return Promise.resolve(new Set<string>());
  });
  const applyK1YearStartAllocations = jest.fn(() => {
    order.push('applyYearStart');

    return Promise.resolve();
  });
  const holdYearStart = jest.fn((_tx: unknown, hold: { items: { requestId: string; costCenterId: string }[] }) =>
    Promise.resolve({
      created: hold.items.map((item) => ({ ...item, commitmentId: `c-${item.requestId}`, attachedVersionId: null })),
      alreadyHeld: [],
      refused: [],
    }),
  );
  const budgets = { listRequestsHoldingYear, lockK1AllocationYears, applyK1YearStartAllocations, holdYearStart };
  const catalog = {
    getPlanRevocationInfo: jest.fn().mockResolvedValue([{ planId: 'plan-k1', provisioningType: 'K1' }]),
    findPlanSeatTargets: jest
      .fn()
      .mockResolvedValue([{ planId: 'plan-k1', provisioningType: 'K1', referenceCommitmentMonths: 12 }]),
    getPlanPrice: jest.fn().mockResolvedValue({
      kind: 'RECURRING',
      unitPrice: { amountMinor: 450_000n, currency: 'VND' },
      billingCycle: 'MONTHLY',
    }),
  };
  const listK1AnnualChainDetails = jest.fn().mockResolvedValue(new Map());
  const grants = {
    listHeldSeatsOfRequests: jest.fn().mockResolvedValue(seats),
    listK1AnnualRootsOfRequests: jest.fn().mockResolvedValue(new Map()),
    listK1AnnualChainDetails,
    listK1AnnualPaidSeatsOn: jest.fn().mockResolvedValue([]),
  };
  const service = new YearStartCommitmentsBatchService(
    repo as never,
    budgets as never,
    catalog as never,
    grants as never,
    {
      getUnitCostCenterIds: jest.fn((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, `cc-${id}`])))),
    } as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
  );
  const held = () => (holdYearStart.mock.calls[0]?.[1] as { items: object[] } | undefined)?.items ?? [];

  return {
    service,
    order,
    confirmedInvoiceIdsByRequests,
    lockK1AllocationYears,
    applyK1YearStartAllocations,
    grants,
    repo,
    held,
  };
}

describe('YearStartCommitmentsBatchService W3-23 K1 annual (K-A1, F9(a), F9(c))', () => {
  it('acquires Tier 0 k1-allocation lock BEFORE reading commitments and applies existing allocations on 01/01', async () => {
    const built = setup(
      [candidate({ id: 'r-k1' })],
      [heldSeat({ requestId: 'r-k1', rootAssignmentId: 'asg-k1', assignmentId: 'asg-k1' })],
    );
    built.grants.listK1AnnualChainDetails.mockResolvedValue(
      new Map([['r-k1', { rootAssignmentId: 'asg-k1', chainAssignmentIds: ['asg-k1'], chainRequestIds: ['r-k1'] }]]),
    );
    built.confirmedInvoiceIdsByRequests.mockResolvedValue(new Map([['r-k1', ['inv-1']]]));

    await built.service.commitBatch(tx as never, PASS, null);

    expect(built.lockK1AllocationYears).toHaveBeenCalledWith(tx, ['asg-k1'], [2027]);
    expect(built.order).toEqual(['k1Lock', 'listHolding', 'applyYearStart']);
    expect(built.applyK1YearStartAllocations).toHaveBeenCalledWith(tx, {
      year: 2027,
      items: [{ requestId: 'r-k1', commitmentId: 'c-r-k1', costCenterId: 'cc-dep-request', invoiceIds: ['inv-1'] }],
    });
  });

  it('F9(c): still commits and applies paid next-year share on 01/01 when K1 annual seat was revoked after invoice confirmation', async () => {
    const built = setup([candidate({ id: 'r-revoked', expectedEndDate: '2027-11-04' })], []);
    built.grants.listK1AnnualChainDetails.mockResolvedValue(
      new Map([
        ['r-revoked', { rootAssignmentId: 'asg-rev', chainAssignmentIds: ['asg-rev'], chainRequestIds: ['r-revoked'] }],
      ]),
    );
    built.grants.listK1AnnualPaidSeatsOn.mockResolvedValue([
      {
        requestId: 'r-revoked',
        rootAssignmentId: 'asg-rev',
        laterAssignmentIds: [],
        assignmentId: 'asg-rev',
        employeeId: 'e-1',
        planId: 'plan-k1',
        owningDepartmentId: 'dep-request',
        expectedEndDate: '2027-11-04',
        validUntil: '2026-12-10',
        personalCommitmentMonths: 12,
        billingAnchorOn: '2026-11-05',
      },
    ]);
    built.confirmedInvoiceIdsByRequests.mockResolvedValue(new Map([['r-revoked', ['inv-1']]]));

    const res = await built.service.commitBatch(tx as never, PASS, null);

    expect(res.created).toBe(1);
    expect(built.held()).toEqual([expect.objectContaining({ requestId: 'r-revoked', amountMinor: 4_500_000n })]);
    expect(built.applyK1YearStartAllocations).toHaveBeenCalledWith(tx, {
      year: 2027,
      items: [
        { requestId: 'r-revoked', commitmentId: 'c-r-revoked', costCenterId: 'cc-dep-request', invoiceIds: ['inv-1'] },
      ],
    });
  });

  it('F-7: after K1 annual transfer on 20/12/2026, 01/01/2027 locks root asg-old and resolves inv-1 via chain request r-old even though purchase_invoices.requestId is r-old', async () => {
    const built = setup(
      [candidate({ id: 'r-new', departmentId: 'dep-new' })],
      [
        heldSeat({
          requestId: 'r-new',
          rootAssignmentId: 'asg-new',
          assignmentId: 'asg-new',
          owningDepartmentId: 'dep-new',
        }),
      ],
    );
    built.grants.listK1AnnualChainDetails.mockResolvedValue(
      new Map([
        [
          'r-new',
          {
            rootAssignmentId: 'asg-old',
            chainAssignmentIds: ['asg-old', 'asg-new'],
            chainRequestIds: ['r-old', 'r-new'],
          },
        ],
      ]),
    );
    built.confirmedInvoiceIdsByRequests.mockImplementation((_tx: unknown, ids: string[]) =>
      Promise.resolve(ids.includes('r-old') ? new Map([['r-old', ['inv-1']]]) : new Map()),
    );

    await built.service.commitBatch(tx as never, PASS, null);

    expect(built.lockK1AllocationYears).toHaveBeenCalledWith(tx, ['asg-old'], [2027]);
    expect(built.confirmedInvoiceIdsByRequests).toHaveBeenCalledWith(tx, expect.arrayContaining(['r-old', 'r-new']));
    expect(built.applyK1YearStartAllocations).toHaveBeenCalledWith(tx, {
      year: 2027,
      items: [{ requestId: 'r-new', commitmentId: 'c-r-new', costCenterId: 'cc-dep-new', invoiceIds: ['inv-1'] }],
    });
  });
});
