import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { CommitmentRepo, HeldWithSeatPrice } from '../budget/commitment.repo';
import { CommitmentRequestFactsHook, type CommitmentRequestView } from '../public/budgets.extension-points';
import { BudgetReviewPriceService } from './budget-review-price.service';
import { knownPriceIncrease } from './budget-review.policy';

const CC = 'cost-center-1';
const YEAR = 2027;
const tx = {} as never;

const held = (over: Partial<HeldWithSeatPrice> = {}): HeldWithSeatPrice => ({
  costCenterId: CC,
  year: YEAR,
  requestId: 'req-1',
  heldMinor: 24_000_000n,
  seatMonthlyMinor: 1_500_000n,
  ...over,
});
const view = (over: Partial<CommitmentRequestView> = {}): CommitmentRequestView => ({
  id: 'req-1',
  software: { name: 'Adobe' },
  plan: { name: 'Team' },
  planId: 'plan-1',
  requester: { employeeCode: 'NV-1', fullName: 'An Nguyen' },
  beneficiaryCount: 4,
  spendApprovedAt: new Date('2027-01-05T00:00:00.000Z'),
  vendorId: 'vendor-1',
  ...over,
});
type Price = { kind: 'RECURRING' | 'ONE_TIME'; unitPrice: { amountMinor: bigint }; billingCycle: string } | null;
const monthly = (amountMinor: bigint, billingCycle = 'MONTHLY'): Price => ({
  kind: 'RECURRING',
  unitPrice: { amountMinor },
  billingCycle,
});

function build(rows: HeldWithSeatPrice[], views: CommitmentRequestView[], prices: Record<string, Price>) {
  const hook = new CommitmentRequestFactsHook();
  hook.bind({
    factsOf: jest.fn((ids: readonly string[]) =>
      Promise.resolve(new Map(views.filter((one) => ids.includes(one.id)).map((one) => [one.id, one]))),
    ),
  });
  const getPlanPrice = jest.fn((planId: string) => Promise.resolve(prices[planId] ?? null));
  const service = new BudgetReviewPriceService(
    { heldWithSeatPrice: jest.fn().mockResolvedValue(rows) } as unknown as CommitmentRepo,
    hook,
    { getPlanPrice } as unknown as CatalogApi,
  );

  return { service, getPlanPrice };
}

describe('the price increase already known of the commitments of a Cost Center (RV-1.3; R-52, US-12-21 AC-7)', () => {
  it('AC-7: 4 seats of Adobe committed at 1.500.000 đ, 24 tr still held, the price 1.650.000 đ from 01/09 and the month of August closed ⟹ 4 seats, 4 months, 2.400.000 đ', async () => {
    const { service, getPlanPrice } = build([held()], [view()], { 'plan-1': monthly(1_650_000n) });

    const items = await service.itemsOf(tx, [CC], YEAR, 8, '2027-09-01');

    expect(items.get(CC)).toEqual([
      { currentMonthlyMinor: 1_650_000n, committedMonthlyMinor: 1_500_000n, seats: 4, monthsLeft: 4 },
    ]);
    expect(knownPriceIncrease(items.get(CC) ?? [])).toBe(2_400_000n);
    expect(getPlanPrice).toHaveBeenCalledWith('plan-1', tx, '2027-09-01');
  });

  it('counts only the months the commitment still holds: a K1 of 9 months held for 2 more months is 2 months, not the 4 of the year', async () => {
    const { service } = build([held({ heldMinor: 12_000_000n })], [view()], { 'plan-1': monthly(1_650_000n) });

    const items = await service.itemsOf(tx, [CC], YEAR, 8, '2027-09-01');

    expect(items.get(CC)?.[0].monthsLeft).toBe(2);
  });

  it('turns the price of a quarter or a year into the price of a month, rounded up, as the commitment did', async () => {
    const { service } = build([held()], [view()], { 'plan-1': monthly(18_000_001n, 'ANNUAL') });

    const items = await service.itemsOf(tx, [CC], YEAR, 8, '2027-09-01');

    expect(items.get(CC)?.[0].currentMonthlyMinor).toBe(1_500_001n);
  });

  it('leaves out what cannot be compared: a request with no plan or no seat, a price that is not by a billing cycle or not recurring, and a plan with no price', async () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => held({ requestId: id }));
    const views = [
      view({ id: 'a', planId: null }),
      view({ id: 'b', beneficiaryCount: 0 }),
      view({ id: 'c', planId: 'other' }),
      view({ id: 'd', planId: 'once' }),
      view({ id: 'e', planId: 'none' }),
    ];
    const { service } = build(rows, views, {
      other: monthly(2_000_000n, 'OTHER'),
      once: { kind: 'ONE_TIME', unitPrice: { amountMinor: 9_000_000n }, billingCycle: 'MONTHLY' },
    });

    expect((await service.itemsOf(tx, [CC], YEAR, 8, '2027-09-01')).size).toBe(0);
  });

  it('reads nothing in December: no month is left', async () => {
    const { service, getPlanPrice } = build([held()], [view()], { 'plan-1': monthly(1_650_000n) });

    expect((await service.itemsOf(tx, [CC], YEAR, 12, '2028-01-01')).size).toBe(0);
    expect(getPlanPrice).not.toHaveBeenCalled();
  });
});
