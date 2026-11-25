import type { GrantedSeatOfRequest } from '../../licensing/public/licensing-open-grants.types';
import { YearStartCommitmentsBatchService, type YearStartPassContext } from './year-start-commitments-batch.service';
import type { YearStartCandidate } from './year-start-commitments.repo';

const tx = { tx: true };
const PASS: YearStartPassContext = { organizationId: 'org-1', year: 2027, now: new Date(), today: '2027-01-05' };

const candidate = (patch: Partial<YearStartCandidate> & { id: string }): YearStartCandidate => ({
  type: 'GRANT',
  state: 'COMPLETED',
  planId: 'plan-1',
  departmentId: 'dep-request',
  expectedEndDate: null,
  termMonths: null,
  budgetYear: 2026,
  nextYearAmountMinor: null,
  amountCurrency: 'VND',
  unitPriceMinor: null,
  billingCycle: null,
  ...patch,
});

const heldSeat = (patch: Partial<GrantedSeatOfRequest> & { requestId: string }): GrantedSeatOfRequest => ({
  rootAssignmentId: `root-${patch.requestId}`,
  laterAssignmentIds: [],
  assignmentId: `root-${patch.requestId}`,
  employeeId: 'e-1',
  planId: 'plan-1',
  owningDepartmentId: 'dep-request',
  expectedEndDate: null,
  validUntil: null,
  ...patch,
});

describe('YearStartCommitmentsBatchService W3-07: monthlyPriceMinor pass-through & K2 monthly slices', () => {
  it('passes monthlyPriceMinor from getPlanPrice and emits months 1..last for K2 while omitting for K1', async () => {
    const repo = {
      lockBatch: jest
        .fn()
        .mockResolvedValue([
          candidate({ id: 'r-k2', planId: 'plan-k2' }),
          candidate({ id: 'r-k1', planId: 'plan-k1' }),
        ]),
      unclaimedSeats: jest.fn().mockResolvedValue(new Map()),
      keptNextYearOfLines: jest.fn().mockResolvedValue(new Map()),
      foreignKeptNextYearOfLines: jest.fn().mockResolvedValue([]),
      renewalSuccessors: jest.fn().mockResolvedValue([]),
      renewalsThatBegan: jest.fn().mockResolvedValue(new Map()),
    };
    const budgets = {
      listRequestsHoldingYear: jest.fn().mockResolvedValue(new Set()),
      holdYearStart: jest.fn((_tx: unknown, hold: { items: { requestId: string; costCenterId: string }[] }) =>
        Promise.resolve({
          created: hold.items.map((item) => ({
            ...item,
            commitmentId: `c-${item.requestId}`,
            attachedVersionId: null,
          })),
          alreadyHeld: [],
          refused: [],
        }),
      ),
    };
    const catalog = {
      getPlanRevocationInfo: jest.fn().mockResolvedValue([
        { planId: 'plan-k2', provisioningType: 'K2' },
        { planId: 'plan-k1', provisioningType: 'K1' },
      ]),
      getPlanPrice: jest.fn().mockResolvedValue({
        kind: 'RECURRING',
        unitPrice: { amountMinor: 5_999_999n, currency: 'VND' },
        monthlyPriceMinor: 500_000n,
        billingCycle: 'ANNUAL',
      }),
    };
    const grants = {
      listHeldSeatsOfRequests: jest
        .fn()
        .mockResolvedValue([
          heldSeat({ requestId: 'r-k2', expectedEndDate: '2027-03-10' }),
          heldSeat({ requestId: 'r-k1', expectedEndDate: '2027-03-10' }),
        ]),
    };
    const organization = {
      getUnitCostCenterIds: jest.fn((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, `cc-${id}`])))),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new YearStartCommitmentsBatchService(
      repo as never,
      budgets as never,
      catalog as never,
      grants as never,
      organization as never,
      audit as never,
    );

    await service.commitBatch(tx as never, PASS, null);

    const held = (budgets.holdYearStart.mock.calls[0]?.[1] as { items: object[] } | undefined)?.items ?? [];
    expect(held).toEqual([
      {
        requestId: 'r-k2',
        costCenterId: 'cc-dep-request',
        currency: 'VND',
        amountMinor: 1_500_000n,
        seatMonthlyMinor: 500_000n,
        months: [
          { month: '2027-01-01', seatCount: 1 },
          { month: '2027-02-01', seatCount: 1 },
          { month: '2027-03-01', seatCount: 1 },
        ],
      },
      {
        requestId: 'r-k1',
        costCenterId: 'cc-dep-request',
        currency: 'VND',
        amountMinor: 1_500_000n,
        seatMonthlyMinor: 500_000n,
      },
    ]);
  });
});
