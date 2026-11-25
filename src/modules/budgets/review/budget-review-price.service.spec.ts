import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { BudgetFactsRepo } from '../budget/budget-facts.repo';
import type { CommitmentRepo, HeldWithSeatPrice } from '../budget/commitment.repo';
import type { InvoiceRepo } from '../budget/invoice.repo';
import {
  CommitmentRequestFactsHook,
  type CommitmentRequestView,
  type PendingSpendContributions,
} from '../public/budgets.extension-points';
import type { SeatMonthRepo } from '../seat-month/seat-month.repo';
import { BudgetReviewFiguresService } from './budget-review-figures.service';
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

/** The price of a plan: the same on every day, or a function of the first day of the month that is asked. */
type PriceOn = Price | ((on: string) => Price);

function build(rows: HeldWithSeatPrice[], views: CommitmentRequestView[], prices: Record<string, PriceOn>) {
  const hook = new CommitmentRequestFactsHook();
  hook.bind({
    factsOf: jest.fn((ids: readonly string[]) =>
      Promise.resolve(new Map(views.filter((one) => ids.includes(one.id)).map((one) => [one.id, one]))),
    ),
  });
  const getPlanPrice = jest.fn((planId: string, _tx: unknown, on: string) => {
    const price = prices[planId];

    return Promise.resolve(typeof price === 'function' ? price(on) : (price ?? null));
  });
  const service = new BudgetReviewPriceService(
    { heldWithSeatPrice: jest.fn().mockResolvedValue(rows) } as unknown as CommitmentRepo,
    hook,
    { getPlanPrice } as unknown as CatalogApi,
  );

  return { service, getPlanPrice };
}

/** The old price until the last day of September, the new one from the first day of October. */
const risesFromOctober = (before: bigint, after: bigint) => (on: string) =>
  monthly(on >= '2027-10-01' ? after : before);

describe('the price increase already known of the commitments of a Cost Center (RV-1.3, FIX-RV1; R-52, US-12-21 AC-7)', () => {
  it('AC-7: 4 seats of Adobe committed at 1.500.000 đ, 24 tr still held, the price 1.650.000 đ from 01/09 and the month of August closed ⟹ 4 seats, 4 months, 2.400.000 đ', async () => {
    const { service, getPlanPrice } = build([held()], [view()], { 'plan-1': monthly(1_650_000n) });

    const items = await service.itemsOf(tx, [CC], YEAR, 8);

    expect(items.get(CC)).toEqual([
      {
        committedMonthlyMinor: 1_500_000n,
        seats: 4,
        heldMinor: 24_000_000n,
        monthlyMinor: [1_650_000n, 1_650_000n, 1_650_000n, 1_650_000n],
      },
    ]);
    expect(knownPriceIncrease(items.get(CC) ?? [])).toBe(2_400_000n);
    expect(getPlanPrice.mock.calls.map((call) => call[2])).toEqual([
      '2027-09-01',
      '2027-10-01',
      '2027-11-01',
      '2027-12-01',
    ]);
  });

  it('RV1-04: a price that takes effect on 01/10, already in the catalog when August is closed, is known: 150.000 x 4 seats x 3 months = 1.800.000 đ', async () => {
    const { service } = build([held()], [view()], { 'plan-1': risesFromOctober(1_500_000n, 1_650_000n) });

    const items = await service.itemsOf(tx, [CC], YEAR, 8);

    expect(items.get(CC)?.[0].monthlyMinor).toEqual([1_500_000n, 1_650_000n, 1_650_000n, 1_650_000n]);
    expect(knownPriceIncrease(items.get(CC) ?? [])).toBe(1_800_000n);
  });

  it('RV1-11: asks the prices of the months after the one closed and no other: October closed asks November and December, November closed asks December', async () => {
    const { service, getPlanPrice } = build([held()], [view()], { 'plan-1': monthly(1_650_000n) });

    const october = await service.itemsOf(tx, [CC], YEAR, 10);
    const november = await service.itemsOf(tx, [CC], YEAR, 11);

    expect(october.get(CC)?.[0].monthlyMinor).toHaveLength(2);
    expect(november.get(CC)?.[0].monthlyMinor).toEqual([1_650_000n]);
    expect(getPlanPrice.mock.calls.map((call) => call[2])).toEqual(['2027-11-01', '2027-12-01', '2027-12-01']);
  });

  it('RV1-11: a commitment that holds more than the months left is worth only the months left: 36 tr of four seats and August closed is 4 x 4 x 150.000 = 2.400.000 đ', async () => {
    const { service } = build([held({ heldMinor: 36_000_000n })], [view()], { 'plan-1': monthly(1_650_000n) });

    const items = await service.itemsOf(tx, [CC], YEAR, 8);

    expect(knownPriceIncrease(items.get(CC) ?? [])).toBe(2_400_000n);
  });

  it('counts only the months the commitment still holds: a K1 of 9 months held for 2 more months is 2 months of four seats, not the 4 of the year', async () => {
    const { service } = build([held({ heldMinor: 12_000_000n })], [view()], { 'plan-1': monthly(1_650_000n) });

    const items = await service.itemsOf(tx, [CC], YEAR, 8);

    expect(knownPriceIncrease(items.get(CC) ?? [])).toBe(1_200_000n);
  });

  it('RV1-05: the months held are not rounded up to a whole month: 20 tr of four seats at 1.500.000 a seat-month is 13,33 seat-months, 2.000.000 đ and not 2.400.000 đ', async () => {
    const { service } = build([held({ heldMinor: 20_000_000n })], [view()], { 'plan-1': monthly(1_650_000n) });

    const items = await service.itemsOf(tx, [CC], YEAR, 8);

    expect(knownPriceIncrease(items.get(CC) ?? [])).toBe(2_000_000n);
  });

  it('turns the price of a quarter or a year into the price of a month, rounded up, as the commitment did', async () => {
    const { service } = build([held()], [view()], { 'plan-1': monthly(18_000_001n, 'ANNUAL') });

    const items = await service.itemsOf(tx, [CC], YEAR, 8);

    expect(items.get(CC)?.[0].monthlyMinor[0]).toBe(1_500_001n);
  });

  it('keeps the price of the month before for a month the catalog has no comparable price for: it is not known to have changed', async () => {
    const { service } = build([held()], [view()], {
      'plan-1': (on) => (on === '2027-11-01' ? null : monthly(on >= '2027-12-01' ? 1_800_000n : 1_500_000n)),
    });

    const items = await service.itemsOf(tx, [CC], YEAR, 8);

    expect(items.get(CC)?.[0].monthlyMinor).toEqual([1_500_000n, 1_500_000n, 1_500_000n, 1_800_000n]);
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

    expect((await service.itemsOf(tx, [CC], YEAR, 8)).size).toBe(0);
  });

  it('reads nothing in December: no month is left', async () => {
    const { service, getPlanPrice } = build([held()], [view()], { 'plan-1': monthly(1_650_000n) });

    expect((await service.itemsOf(tx, [CC], YEAR, 12)).size).toBe(0);
    expect(getPlanPrice).not.toHaveBeenCalled();
  });
});

describe('BudgetReviewFiguresService (W3-07 Q-G priorYearReleasedMinor)', () => {
  const TX = {} as DbTx;

  function buildFigures(priorYearReleasedMap: Map<string, bigint>) {
    const budgets = {
      approvedOfYear: jest
        .fn()
        .mockResolvedValue(new Map([['cc-1', { baseMinor: 10_000_000n, reserveMinor: 0n, currency: 'VND' }]])),
      priorYearReleasedOf: jest.fn().mockResolvedValue(priorYearReleasedMap),
    };
    const commitments = {
      totals: jest.fn().mockResolvedValue(new Map([['cc-1:2027', { held: 1_000_000n, spent: 0n }]])),
    };
    const service = new BudgetReviewFiguresService(
      budgets as unknown as BudgetFactsRepo,
      commitments as unknown as CommitmentRepo,
      {
        spentOf: jest.fn().mockResolvedValue(new Map()),
        priceBasisOf: jest.fn().mockResolvedValue(new Map()),
      } as unknown as InvoiceRepo,
      { totals: jest.fn().mockResolvedValue(new Map()) } as unknown as PendingSpendContributions,
      { itemsOf: jest.fn().mockResolvedValue(new Map()) } as unknown as BudgetReviewPriceService,
      {} as SeatMonthRepo,
    );

    return { service, budgets };
  }

  it('Q-G: populates priorYearReleasedMinor from year-1 in January (month === 1)', async () => {
    const { service, budgets } = buildFigures(new Map([['cc-1', 800_000n]]));

    const lines = await service.linesOf(TX, 2027, 1, 'VND');

    expect(budgets.priorYearReleasedOf).toHaveBeenCalledWith(['cc-1'], 2026, TX);
    expect(lines[0].priorYearReleasedMinor).toBe(800_000n);
  });

  it('sets priorYearReleasedMinor to 0n when month > 1 without querying prior year releases', async () => {
    const { service, budgets } = buildFigures(new Map([['cc-1', 800_000n]]));

    const lines = await service.linesOf(TX, 2027, 2, 'VND');

    expect(budgets.priorYearReleasedOf).not.toHaveBeenCalled();
    expect(lines[0].priorYearReleasedMinor).toBe(0n);
  });
});
