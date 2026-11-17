import type { GrantedSeatOfRequest } from '../../licensing/public/licensing-open-grants.types';
import { YearStartCommitmentsBatchService, type YearStartPassContext } from './year-start-commitments-batch.service';
import type { YearStartCandidate } from './year-start-commitments.repo';

const tx = { tx: true };
const PASS: YearStartPassContext = { organizationId: 'org-1', year: 2027, now: new Date(), today: '2027-01-05' };
/** 650 000 VND a month, the price of 01/01 of the plan of every request. */
const PRICE = { kind: 'RECURRING', unitPrice: { amountMinor: 650_000n, currency: 'VND' }, billingCycle: 'MONTHLY' };

/** A request for 9 months approved in 2026 at 600.000 a month that kept 4.200.000 of 2027 (T-RQ2), unless a test says otherwise. */
const candidate = (patch: Partial<YearStartCandidate> = {}): YearStartCandidate => ({
  id: 'r-1',
  type: 'GRANT',
  state: 'COMPLETED',
  planId: 'plan-1',
  departmentId: 'dep-request',
  expectedEndDate: null,
  termMonths: 9,
  budgetYear: 2026,
  nextYearAmountMinor: 4_200_000n,
  amountCurrency: 'VND',
  unitPriceMinor: 600_000n,
  billingCycle: 'MONTHLY',
  ...patch,
});
/** The seat of that request: its term ran to 14/08, and its period closes on `validUntil` (exclusive). */
const seat = (validUntil: string | null): GrantedSeatOfRequest => ({
  requestId: 'r-1',
  rootAssignmentId: 'a-1',
  laterAssignmentIds: [],
  assignmentId: 'a-1',
  employeeId: 'e-1',
  planId: 'plan-1',
  owningDepartmentId: 'dep-request',
  expectedEndDate: '2027-08-14',
  validUntil,
});

/** The batch over stand-ins: the request it locks, its seat, the price of 01/01 and the Cost Center; returns what it held. */
async function held(request: YearStartCandidate, validUntil: string | null): Promise<object[]> {
  const repo = {
    lockBatch: jest.fn().mockResolvedValue([request]),
    unclaimedSeats: jest.fn().mockResolvedValue(new Map()),
    keptNextYearOfLines: jest.fn().mockResolvedValue(new Map()),
    foreignKeptNextYearOfLines: jest.fn().mockResolvedValue([]),
    renewalSuccessors: jest.fn().mockResolvedValue([]),
    renewalsThatBegan: jest.fn().mockResolvedValue(new Map()),
  };
  const budgets = {
    listRequestsHoldingYear: jest.fn().mockResolvedValue(new Set()),
    holdYearStart: jest.fn((_tx: unknown, hold: { items: { requestId: string }[] }) =>
      Promise.resolve({ created: hold.items, alreadyHeld: [], refused: [] }),
    ),
  };
  const catalog = {
    getPlanRevocationInfo: jest.fn().mockResolvedValue([{ planId: 'plan-1', provisioningType: 'K2' }]),
    getPlanPrice: jest.fn().mockResolvedValue(PRICE),
  };
  const grants = { listHeldSeatsOfRequests: jest.fn().mockResolvedValue([seat(validUntil)]) };
  const organization = {
    getUnitCostCenterIds: jest.fn((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, `cc-${id}`])))),
  };
  const service = new YearStartCommitmentsBatchService(
    repo as never,
    budgets as never,
    catalog as never,
    grants as never,
    organization as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
  );

  await service.commitBatch(tx as never, PASS, null);

  return (budgets.holdYearStart.mock.calls[0]?.[1] as { items: object[] } | undefined)?.items ?? [];
}

describe('YearStartCommitmentsBatchService: a seat that closes before the term its approval counted (QĐ-111ak, B1A-04)', () => {
  it('holds three months to 31/03 at the price the request was approved at (600.000, its own unit price), not at the 650.000 of 01/01', async () => {
    expect(await held(candidate(), '2027-04-01')).toEqual([
      expect.objectContaining({ requestId: 'r-1', amountMinor: 1_800_000n, seatMonthlyMinor: 650_000n }),
    ]);
  });

  it('holds what the approval kept when the seat does not close before its term', async () => {
    expect(await held(candidate(), null)).toEqual([expect.objectContaining({ amountMinor: 4_200_000n })]);
  });

  it('holds what the approval kept when the request carries no price to count with (nothing is worked out at the price of 01/01)', async () => {
    const unpriced = candidate({ unitPriceMinor: null, billingCycle: null });

    expect(await held(unpriced, '2027-04-01')).toEqual([expect.objectContaining({ amountMinor: 4_200_000n })]);
  });

  it('does not read the price of an approval in another currency as dong: nothing kept in dong, so the months at the price of 01/01', async () => {
    const dollars = candidate({ amountCurrency: 'USD', nextYearAmountMinor: 14_000n, unitPriceMinor: 2_000n });

    expect(await held(dollars, '2027-04-01')).toEqual([expect.objectContaining({ amountMinor: 3n * 650_000n })]);
  });
});
