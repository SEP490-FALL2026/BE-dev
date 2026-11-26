import { classifyIdleSeatCosts, type LabelClassificationInput } from './shared-pool-line-label.policy';

const WINDOWS = { monthlyDays: 7, annualDays: 30, redAlertDaysAnnual: 30 };

const annual = (extra: Partial<LabelClassificationInput> = {}): LabelClassificationInput => ({
  subscriptionId: 'sub-annual',
  purchasedQuantity: 12,
  monthlyPriceMinor: 500_000n,
  startDate: '2026-07-01',
  endExclusive: '2027-07-01',
  kind: 'TERM',
  commitmentTermMonths: 12,
  billingCycle: 'ANNUAL',
  noticeDeadline: null,
  noticePeriodDays: 30,
  renewalDate: '2027-07-01',
  endDate: '2027-07-01',
  autoRenew: true,
  vendorMinimumSeats: null,
  qNext: null,
  windows: WINDOWS,
  ...extra,
});

const fullSeats = (count: number, heldFrom = '2026-07-01', heldUntil: string | null = null) =>
  Array.from({ length: count }, () => ({ heldFrom, heldUntil }));

describe('shared-pool-line-label.policy: W3-06 idle cost labels, R-LATE split & 10% threshold', () => {
  it.each<{
    name: string;
    month: string;
    input: LabelClassificationInput;
    held: Array<{ heldFrom: string; heldUntil: string | null }>;
    reducible: bigint;
    lockedUntil: Record<string, bigint>;
    ratioPercent: string;
    exceeds: boolean;
  }>([
    {
      name: 'case 1: May 2027 (31d), 1 idle seat -> 01/05 locked 01/07/2027 (16.129) + 02..31/05 reducible (483.871)',
      month: '2027-05-01',
      input: annual({ purchasedQuantity: 12 }),
      held: fullSeats(11),
      reducible: 483_871n,
      lockedUntil: { '2027-07-01': 16_129n },
      ratioPercent: '8.33',
      exceeds: false,
    },
    {
      name: 'case 2: June 2027 (30d), 1 idle seat, qNext null -> 01/06 reducible (16.667) + 02..30/06 locked 01/07/2028 (483.333)',
      month: '2027-06-01',
      input: annual({ purchasedQuantity: 12, qNext: null }),
      held: fullSeats(11),
      reducible: 16_667n,
      lockedUntil: { '2028-07-01': 483_333n },
      ratioPercent: '8.33',
      exceeds: false,
    },
    {
      name: 'case 3: June 2027 (30d), 2 idle seats, qNext=11 -> 33.333 reducible + 483.333 (2027) + 483.334 (2028 remainder)',
      month: '2027-06-01',
      input: annual({ purchasedQuantity: 12, qNext: 11 }),
      held: fullSeats(10),
      reducible: 33_333n,
      lockedUntil: { '2027-07-01': 483_333n, '2028-07-01': 483_334n },
      ratioPercent: '16.67',
      exceeds: true,
    },
    {
      name: 'case 4a: Figma monthly Jan 2027 (20..31/01, 1 idle) -> all locked until 2027-02-15',
      month: '2027-01-01',
      input: annual({
        purchasedQuantity: 10,
        startDate: '2027-01-20',
        endExclusive: '2027-02-21',
        commitmentTermMonths: 1,
        billingCycle: 'MONTHLY',
        noticePeriodDays: null,
        renewalDate: '2027-01-15',
        endDate: null,
      }),
      held: fullSeats(9, '2027-01-20'),
      reducible: 0n,
      lockedUntil: { '2027-02-15': 193_548n },
      ratioPercent: '10.00',
      exceeds: false,
    },
    {
      name: 'case 4b: Figma monthly Feb 2027 (01..20/02, 1 idle) -> 01..07 locked 15/02, 08..15 reducible, 16..20 locked 15/03',
      month: '2027-02-01',
      input: annual({
        purchasedQuantity: 10,
        startDate: '2027-01-20',
        endExclusive: '2027-02-21',
        commitmentTermMonths: 1,
        billingCycle: 'MONTHLY',
        noticePeriodDays: null,
        renewalDate: '2027-01-15',
        endDate: null,
      }),
      held: fullSeats(9, '2027-01-20'),
      reducible: 142_857n,
      lockedUntil: { '2027-02-15': 125_000n, '2027-03-15': 89_286n },
      ratioPercent: '10.00',
      exceeds: false,
    },
    {
      name: 'case 5a: 01/2027 ratio 9.14% -> no alert',
      month: '2027-01-01',
      input: annual({ purchasedQuantity: 12 }),
      held: [...fullSeats(10), ...fullSeats(2, '2026-07-01', '2027-01-15')],
      reducible: 0n,
      lockedUntil: { '2027-07-01': 548_387n },
      ratioPercent: '9.14',
      exceeds: false,
    },
    {
      name: 'case 5b: 03/2027 ratio 10.75% -> triggers alert',
      month: '2027-03-01',
      input: annual({ purchasedQuantity: 12 }),
      held: [...fullSeats(10), ...fullSeats(1, '2026-07-01', '2027-03-23')],
      reducible: 0n,
      lockedUntil: { '2027-07-01': 645_161n },
      ratioPercent: '10.75',
      exceeds: true,
    },
    {
      name: 'case 6a: exact 10.00% boundary (30 / 300 seat-days) -> false (kills >=)',
      month: '2026-11-01',
      input: annual({ purchasedQuantity: 10 }),
      held: fullSeats(9),
      reducible: 0n,
      lockedUntil: { '2027-07-01': 500_000n },
      ratioPercent: '10.00',
      exceeds: false,
    },
    {
      name: 'case 6b: 10.33% (31 / 300 seat-days) -> true',
      month: '2026-11-01',
      input: annual({ purchasedQuantity: 10 }),
      held: [...fullSeats(8), ...fullSeats(1, '2026-11-02')],
      reducible: 0n,
      lockedUntil: { '2027-07-01': 516_667n },
      ratioPercent: '10.33',
      exceeds: true,
    },
    {
      name: 'case 7: vendorMinimumSeats=5, 4 held (1 idle inside minimum) -> excluded from ratio (0%), kept in idleCost',
      month: '2026-11-01',
      input: annual({ purchasedQuantity: 5, vendorMinimumSeats: 5 }),
      held: fullSeats(4),
      reducible: 0n,
      lockedUntil: { '2027-07-01': 500_000n },
      ratioPercent: '0.00',
      exceeds: false,
    },
  ])('$name', ({ month, input, held, reducible, lockedUntil, ratioPercent, exceeds }) => {
    const res = classifyIdleSeatCosts(input, held, month);

    expect(res.byLabel.missedAdjustmentMinor).toBe(0n);
    expect(res.byLabel.reducibleMinor).toBe(reducible);
    expect(res.byLabel.lockedUntil).toEqual(lockedUntil);
    expect(res.ratioPercent).toBe(ratioPercent);
    expect(res.exceedsIdleRatioThreshold).toBe(exceeds);
  });

  it.each<{
    name: string;
    month: string;
    input: LabelClassificationInput;
    held: Array<{ heldFrom: string; heldUntil: string | null }>;
    missedAdjustment: bigint;
    reducible: bigint;
    lockedUntil: Record<string, bigint>;
  }>([
    {
      name: 'W3-22 label (1) wins over (3) LOCKED_UNTIL: Ca B 2A July 2027 (missed 1, 1 idle) -> 500.000 in missedAdjustment, 0 in lockedUntil',
      month: '2027-07-01',
      input: annual({
        purchasedQuantity: 12,
        startDate: '2027-07-01',
        endExclusive: '2028-07-01',
        renewalDate: '2028-07-01',
        endDate: '2028-06-30',
        missedSeats: 1,
      }),
      held: fullSeats(11, '2027-07-01'),
      missedAdjustment: 500_000n,
      reducible: 0n,
      lockedUntil: {},
    },
    {
      name: 'W3-22 label (1) wins over (2) REDUCIBLE & splits remainder: May 2028 (missed 1, 2 idle) -> 500.000 missed + 483.871 reducible + 16.129 locked',
      month: '2028-05-01',
      input: annual({
        purchasedQuantity: 12,
        startDate: '2027-07-01',
        endExclusive: '2028-07-01',
        renewalDate: '2028-07-01',
        endDate: '2028-07-01',
        missedSeats: 1,
      }),
      held: fullSeats(10, '2027-07-01'),
      missedAdjustment: 500_000n,
      reducible: 483_871n,
      lockedUntil: { '2028-07-01': 16_129n },
    },
    {
      name: 'W3-22 Ca B 2A Sep 2027: missed 1, re-granted 16/09/2027 -> 250.000 missedAdjustment',
      month: '2027-09-01',
      input: annual({
        purchasedQuantity: 12,
        startDate: '2027-07-01',
        endExclusive: '2028-07-01',
        renewalDate: '2028-07-01',
        endDate: '2028-06-30',
        missedSeats: 1,
      }),
      held: [...fullSeats(11, '2027-07-01'), ...fullSeats(1, '2027-09-16')],
      missedAdjustment: 250_000n,
      reducible: 0n,
      lockedUntil: {},
    },
    {
      name: 'W3-22 MEMBERS: missedSeats = 0 -> never populates missedAdjustmentMinor',
      month: '2027-07-01',
      input: annual({
        purchasedQuantity: 12,
        startDate: '2027-07-01',
        endExclusive: '2028-07-01',
        commitmentTermMonths: 1,
        billingCycle: 'MONTHLY',
        renewalDate: '2027-08-01',
        endDate: '2027-07-31',
        missedSeats: 0,
      }),
      held: fullSeats(10, '2027-07-01'),
      missedAdjustment: 0n,
      reducible: 225_806n,
      lockedUntil: { '2027-08-01': 774_194n },
    },
  ])('$name', ({ month, input, held, missedAdjustment, reducible, lockedUntil }) => {
    const res = classifyIdleSeatCosts(input, held, month);

    expect(res.byLabel.missedAdjustmentMinor).toBe(missedAdjustment);
    expect(res.byLabel.reducibleMinor).toBe(reducible);
    expect(res.byLabel.lockedUntil).toEqual(lockedUntil);
  });
});
