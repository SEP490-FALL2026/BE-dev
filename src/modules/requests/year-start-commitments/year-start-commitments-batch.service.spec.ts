import type { GrantedSeatOfRequest } from '../../licensing/public/licensing-open-grants.types';
import { YearStartCommitmentsBatchService, type YearStartPassContext } from './year-start-commitments-batch.service';
import type { YearStartCandidate } from './year-start-commitments.repo';

const tx = { tx: true };
const PASS: YearStartPassContext = { organizationId: 'org-1', year: 2027, now: new Date(), today: '2027-01-05' };
/** 1 000 000 VND a month, the plan of every request unless a test says otherwise. */
const VND_PRICE = {
  kind: 'RECURRING',
  unitPrice: { amountMinor: 1_000_000n, currency: 'VND' },
  billingCycle: 'MONTHLY',
};

const candidate = (patch: Partial<YearStartCandidate> & { id: string }): YearStartCandidate => ({
  type: 'GRANT',
  state: 'COMPLETED',
  planId: 'plan-1',
  departmentId: 'dep-request',
  expectedEndDate: null,
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

/**
 * The batch over stand-ins: the requests the batch locks, the seats licensing reads along the chains, the price of the plan and the Cost
 * Center of each department. Nothing is converted (`QĐ-111an`), so there is no stand-in for the rates.
 */
function setup(input: {
  candidates: YearStartCandidate[];
  seats?: GrantedSeatOfRequest[];
  renewals?: { requestId: string; assignmentId: string }[];
  renewalsThatBegan?: Map<string, string>;
  price?: object | null;
}) {
  const repo = {
    lockBatch: jest.fn().mockResolvedValue(input.candidates),
    unclaimedSeats: jest.fn().mockResolvedValue(new Map()),
    renewalSuccessors: jest.fn().mockResolvedValue(input.renewals ?? []),
    renewalsThatBegan: jest.fn().mockResolvedValue(input.renewalsThatBegan ?? new Map()),
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
    getPlanPrice: jest.fn().mockResolvedValue(input.price === undefined ? VND_PRICE : input.price),
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
  const skipped = () =>
    audit.record.mock.calls.map(
      (call: unknown[]) => (call[1] as { after: { requestId: string; reason: string } }).after,
    );

  return { service, repo, budgets, catalog, grants, organization, held, skipped };
}

describe('YearStartCommitmentsBatchService (BR-MF1-09e, FR-5.8(6): one batch of the pass of 01/01)', () => {
  describe('a right a renewal extended is the renewal’s', () => {
    it('BR-MF1-09e: the renewal holds the year of the record that follows the renewed one; the request that first granted it holds nothing', async () => {
      const grant = candidate({ id: 'r-grant' });
      const renewal = candidate({ id: 'r-renewal', type: 'RENEWAL' });
      const { service, grants, held, skipped } = setup({
        candidates: [grant, renewal],
        renewals: [{ requestId: 'r-renewal', assignmentId: 'a-2' }],
        // The grant's record a-1 was followed by a-2, which the renewal began; a-2 runs to 30/06.
        seats: [
          heldSeat({
            requestId: 'r-grant',
            rootAssignmentId: 'a-1',
            laterAssignmentIds: ['a-2'],
            assignmentId: 'a-2',
            expectedEndDate: '2027-06-30',
          }),
          heldSeat({
            requestId: 'r-renewal',
            rootAssignmentId: 'a-2',
            assignmentId: 'a-2',
            expectedEndDate: '2027-06-30',
          }),
        ],
        renewalsThatBegan: new Map([['a-2', 'r-renewal']]),
      });

      expect(await service.commitBatch(tx as never, PASS, null)).toEqual({
        lastId: 'r-renewal',
        created: 1,
        skipped: 0,
      });

      expect(grants.listHeldSeatsOfRequests).toHaveBeenCalledWith(
        { grantRequestIds: ['r-grant'], namedRoots: [{ requestId: 'r-renewal', assignmentId: 'a-2' }] },
        '2027-01-01',
        tx,
      );
      expect(held()).toEqual([
        expect.objectContaining({
          requestId: 'r-renewal',
          amountMinor: 6_000_000n,
          currency: 'VND',
          costCenterId: 'cc-dep-request',
        }),
      ]);
      // Nothing of the grant is left out with an event: it has nothing to commit.
      expect(skipped()).toEqual([]);
    });

    it('QĐ-109b: a renewal whose new term begins on 01/01 holds the months of the new term in the new year', async () => {
      const { service, held } = setup({
        candidates: [candidate({ id: 'r-renewal', type: 'RENEWAL' })],
        renewals: [{ requestId: 'r-renewal', assignmentId: 'a-2' }],
        seats: [
          heldSeat({
            requestId: 'r-renewal',
            rootAssignmentId: 'a-2',
            assignmentId: 'a-2',
            expectedEndDate: '2027-12-31',
          }),
        ],
      });

      await service.commitBatch(tx as never, PASS, null);

      expect(held()).toEqual([expect.objectContaining({ requestId: 'r-renewal', amountMinor: 12_000_000n })]);
    });

    it('BR-MF1-09e: an approved renewal that no record follows yet holds nothing on 01/01', async () => {
      const { service, held, skipped } = setup({
        candidates: [candidate({ id: 'r-renewal', type: 'RENEWAL', state: 'AWAITING_EXECUTION' })],
      });

      await service.commitBatch(tx as never, PASS, null);

      expect([held(), skipped()]).toEqual([[], []]);
    });
  });

  describe('the department that bears the cost now', () => {
    it('BR-MF1-09e: a service account handed over to another department is charged to the Cost Center of that department', async () => {
      const { service, organization, held } = setup({
        candidates: [candidate({ id: 'r-service', type: 'SERVICE_ACCOUNT', departmentId: 'dep-ops' })],
        seats: [
          heldSeat({
            requestId: 'r-service',
            laterAssignmentIds: ['a-handover'],
            assignmentId: 'a-handover',
            owningDepartmentId: 'dep-fin',
          }),
        ],
      });

      await service.commitBatch(tx as never, PASS, null);

      expect(organization.getUnitCostCenterIds).toHaveBeenCalledWith(['dep-fin'], tx);
      expect(held()).toEqual([expect.objectContaining({ requestId: 'r-service', costCenterId: 'cc-dep-fin' })]);
    });
  });

  describe('the price of 01/01, in dong as it stands', () => {
    it('BR-MF1-09e: the price is the one of 01/01, whatever day the pass runs', async () => {
      const { service, catalog } = setup({
        candidates: [candidate({ id: 'r-1', state: 'AWAITING_EXECUTION' })],
        seats: [heldSeat({ requestId: 'r-1' })],
      });

      await service.commitBatch(tx as never, PASS, null);

      expect(catalog.getPlanPrice).toHaveBeenCalledWith('plan-1', tx, '2027-01-01');
    });

    it('QĐ-111an: the amount of the year and the price of a month are held as the price gives them, nothing is converted', async () => {
      const { service, held } = setup({
        candidates: [candidate({ id: 'r-1' })],
        seats: [heldSeat({ requestId: 'r-1' })],
      });

      await service.commitBatch(tx as never, PASS, null);

      expect(held()).toEqual([
        {
          requestId: 'r-1',
          costCenterId: 'cc-dep-request',
          currency: 'VND',
          amountMinor: 12_000_000n,
          seatMonthlyMinor: 1_000_000n,
        },
      ]);
    });

    it('QĐ-111an: a price left in another currency is left out as a plan with no price, and nothing in another currency is ever held', async () => {
      const { service, held, skipped } = setup({
        candidates: [candidate({ id: 'r-usd' })],
        seats: [heldSeat({ requestId: 'r-usd' })],
        price: { kind: 'RECURRING', unitPrice: { amountMinor: 2000n, currency: 'USD' }, billingCycle: 'MONTHLY' },
      });

      expect(await service.commitBatch(tx as never, PASS, null)).toMatchObject({ created: 0, skipped: 1 });
      expect(held()).toEqual([]);
      expect(skipped()).toEqual([{ requestId: 'r-usd', year: 2027, reason: 'NO_PRICE' }]);
    });

    it('FR-5.8(6): an amount larger than a money value may hold is left out with the reason AMOUNT_TOO_LARGE', async () => {
      const { service, skipped } = setup({
        candidates: [candidate({ id: 'r-1' })],
        seats: [heldSeat({ requestId: 'r-1' })],
        price: { kind: 'RECURRING', unitPrice: { amountMinor: 10n ** 15n, currency: 'VND' }, billingCycle: 'MONTHLY' },
      });

      await service.commitBatch(tx as never, PASS, null);

      expect(skipped()).toEqual([{ requestId: 'r-1', year: 2027, reason: 'AMOUNT_TOO_LARGE' }]);
    });

    it('QĐ-111an: a commitment the budgets refuse is no case of the pass but a budget that is not in dong: the batch stops and writes nothing of its own', async () => {
      const { service, budgets, skipped } = setup({
        candidates: [candidate({ id: 'r-1' })],
        seats: [heldSeat({ requestId: 'r-1' })],
      });
      (budgets.holdYearStart as jest.Mock).mockResolvedValue({
        created: [],
        alreadyHeld: [],
        refused: [{ requestId: 'r-1', reason: 'CURRENCY_MISMATCH' }],
      });

      await expect(service.commitBatch(tx as never, PASS, null)).rejects.toThrow('is not in dong');
      expect(skipped()).toEqual([]);
    });
  });
});
