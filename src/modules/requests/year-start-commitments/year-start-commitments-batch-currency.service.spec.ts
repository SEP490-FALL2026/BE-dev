import type { GrantedSeatOfRequest } from '../../licensing/public/licensing-open-grants.types';
import { YearStartCommitmentsBatchService, type YearStartPassContext } from './year-start-commitments-batch.service';
import type { ForeignKeptLine, YearStartCandidate } from './year-start-commitments.repo';

const tx = { tx: true };
const PASS: YearStartPassContext = { organizationId: 'org-1', year: 2027, now: new Date(), today: '2027-01-05' };
/** 650 000 VND a month, the price of 01/01 of the plan of every request. */
const PRICE = { kind: 'RECURRING', unitPrice: { amountMinor: 650_000n, currency: 'VND' }, billingCycle: 'MONTHLY' };

const candidate = (patch: Partial<YearStartCandidate> & { id: string }): YearStartCandidate => ({
  type: 'GRANT',
  state: 'AWAITING_EXECUTION',
  planId: 'plan-1',
  departmentId: 'dep-request',
  expectedEndDate: null,
  termMonths: 9,
  budgetYear: 2026,
  nextYearAmountMinor: null,
  amountCurrency: 'VND',
  ...patch,
});

/** The batch over stand-ins, for the numbers an approval kept in a currency other than dong (`QĐ-111an`, B1A-01). */
function setup(input: {
  candidates: YearStartCandidate[];
  unclaimed?: Map<string, { expectedEndDate: string | null; employeeId: string | null }[]>;
  seats?: GrantedSeatOfRequest[];
  kept?: Map<string, Map<string, bigint>>;
  foreign?: ForeignKeptLine[];
}) {
  const repo = {
    lockBatch: jest.fn().mockResolvedValue(input.candidates),
    unclaimedSeats: jest.fn().mockResolvedValue(input.unclaimed ?? new Map()),
    keptNextYearOfLines: jest.fn().mockResolvedValue(input.kept ?? new Map()),
    foreignKeptNextYearOfLines: jest.fn().mockResolvedValue(input.foreign ?? []),
    renewalSuccessors: jest.fn().mockResolvedValue([]),
    renewalsThatBegan: jest.fn().mockResolvedValue(new Map()),
  };
  const budgets = {
    listRequestsHoldingYear: jest.fn().mockResolvedValue(new Set()),
    holdYearStart: jest.fn((_tx: unknown, hold: { items: { requestId: string; costCenterId: string }[] }) =>
      Promise.resolve({
        created: hold.items.map((item) => ({ ...item, commitmentId: `c-${item.requestId}`, attachedVersionId: null })),
        alreadyHeld: [],
        refused: [],
      }),
    ),
  };
  const catalog = {
    getPlanRevocationInfo: jest.fn().mockResolvedValue([{ planId: 'plan-1', provisioningType: 'K2' }]),
    getPlanPrice: jest.fn().mockResolvedValue(PRICE),
  };
  const grants = { listHeldSeatsOfRequests: jest.fn().mockResolvedValue(input.seats ?? []) };
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
  const held = () => (budgets.holdYearStart.mock.calls[0]?.[1] as { items: object[] } | undefined)?.items ?? [];
  /** What the audit trail says of the numbers left unread: the request and what is said of it. */
  const ignored = () =>
    audit.record.mock.calls
      .map((call: unknown[]) => call[1] as { action: string; resourceId: string; after: Record<string, unknown> })
      .filter((event) => event.action === 'BUDGET_COMMITMENT.YEAR_START_SAVED_AMOUNT_IGNORED')
      .map((event) => [event.resourceId, event.after]);

  return { service, held, ignored };
}

describe('YearStartCommitmentsBatchService: a number the approval kept in another currency than dong (QĐ-111an, B1A-01)', () => {
  it('a request approved in dollars is not counted by the 14.000 cents it kept: the months of use from 01/01 at the price of 01/01, and the audit trail says so', async () => {
    const { service, held, ignored } = setup({
      candidates: [candidate({ id: 'r-usd', nextYearAmountMinor: 14_000n, amountCurrency: 'USD' })],
      unclaimed: new Map([['r-usd', [{ expectedEndDate: null, employeeId: null }]]]),
    });

    await service.commitBatch(tx as never, PASS, null);

    expect(held()).toEqual([expect.objectContaining({ requestId: 'r-usd', amountMinor: 9n * 650_000n })]);
    expect(ignored()).toEqual([
      ['r-usd', { requestId: 'r-usd', employeeId: null, year: 2027, currency: 'USD', savedMinor: '14000' }],
    ]);
  });

  it('the same number in dong is read as ever, and nothing is said', async () => {
    const { service, held, ignored } = setup({
      candidates: [candidate({ id: 'r-vnd', nextYearAmountMinor: 4_200_000n })],
      unclaimed: new Map([['r-vnd', [{ expectedEndDate: null, employeeId: null }]]]),
    });

    await service.commitBatch(tx as never, PASS, null);

    expect(held()).toEqual([expect.objectContaining({ requestId: 'r-vnd', amountMinor: 4_200_000n })]);
    expect(ignored()).toEqual([]);
  });

  it('a request that kept nothing of this year, whatever its currency, has nothing to leave unread', async () => {
    const { service, ignored } = setup({
      candidates: [candidate({ id: 'r-old', nextYearAmountMinor: 14_000n, amountCurrency: 'USD', budgetYear: 2025 })],
      unclaimed: new Map([['r-old', [{ expectedEndDate: null, employeeId: null }]]]),
    });

    await service.commitBatch(tx as never, PASS, null);

    expect(ignored()).toEqual([]);
  });

  it('a person of a group whose kept line is in dollars is counted by the months of their seat, and the others by their kept line', async () => {
    const { service, held, ignored } = setup({
      candidates: [candidate({ id: 'r-group', type: 'GROUP_GRANT' })],
      unclaimed: new Map([
        [
          'r-group',
          [
            { expectedEndDate: null, employeeId: 'e-1' },
            { expectedEndDate: null, employeeId: 'e-2' },
          ],
        ],
      ]),
      kept: new Map([['r-group', new Map([['e-1', 4_200_000n]])]]),
      foreign: [{ requestId: 'r-group', employeeId: 'e-2', currency: 'USD', amountMinor: 14_000n }],
    });

    await service.commitBatch(tx as never, PASS, null);

    expect(held()).toEqual([expect.objectContaining({ amountMinor: 4_200_000n + 9n * 650_000n })]);
    expect(ignored()).toEqual([
      ['r-group', { requestId: 'r-group', employeeId: 'e-2', year: 2027, currency: 'USD', savedMinor: '14000' }],
    ]);
  });
});
