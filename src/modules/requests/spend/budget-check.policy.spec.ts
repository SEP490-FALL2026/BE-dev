import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BudgetCheckRepo } from './budget-check.repo';
import { checkBudget, codesOf, costInDong, wireRouteOf, type YearBudget, type YearSlice } from './budget-check.policy';

/** Base 100, reserve 10, spent 40, held 20 and 15 waiting to be decided: 25 left of the base and 35 with the reserve. */
const budget = (over: Partial<YearBudget> = {}): YearBudget => ({
  versionId: 'v-1',
  baseMinor: 100n,
  reserveMinor: 10n,
  heldMinor: 20n,
  spentMinor: 40n,
  ...over,
});

const check = (costMinor: bigint, slice: Partial<YearSlice> = {}, priceExpired = false) =>
  checkBudget({
    slice: { year: 2026, costMinor, budget: budget(), pendingMinor: 15n, ...slice },
    priceExpired,
  });

describe('the check of the budget of a request (BR-MF1-06e..g)', () => {
  describe('BR-MF1-06g: three outcomes on the base and the reserve of the approved version', () => {
    it.each([
      [25n, 'WITHIN_BASE', null],
      [26n, 'USES_RESERVE', 1n],
      [35n, 'USES_RESERVE', 10n],
    ] as const)('a cost of %s is %s, over the base by %s', (cost, outcome, overBase) => {
      const result = check(cost);

      expect(result.outcome).toBe(outcome);
      expect(result.overBaseByMinor).toBe(overBase);
      expect(result.blockReasons).toEqual([]);
      expect(result.route).toBe('SPEND_APPROVAL');
    });

    it('BR-MF1-06g: one more than what is left with the reserve is blocked, over the reserve by 1', () => {
      const result = check(36n);

      expect(result).toMatchObject({
        outcome: 'BLOCKED',
        blockReasons: ['OVER_RESERVE'],
        overBaseByMinor: 11n,
        overByMinor: 1n,
        route: 'BLOCKED',
      });
    });

    it('BR-MF1-06e: the two levels of what is left count what is spent, held and waiting, and the reserve is added for the second', () => {
      const [year] = check(1n).years;

      expect(year).toMatchObject({
        baseMinor: 100n,
        reserveMinor: 10n,
        spentMinor: 40n,
        heldMinor: 20n,
        pendingMinor: 15n,
        remainingBaseMinor: 25n,
        remainingWithReserveMinor: 35n,
        code: 'BUDGET_OK',
      });
    });
  });

  describe('BR-MF1-06g(3)(ii): the Cost Center has no approved version of the year', () => {
    it('is blocked with NO_APPROVED_BUDGET and has no figure of a budget (that is not a budget of 0)', () => {
      const result = check(1n, { budget: null });

      expect(result).toMatchObject({ outcome: 'BLOCKED', blockReasons: ['NO_APPROVED_BUDGET'], overByMinor: null });
      expect(result.years[0]).toMatchObject({
        code: 'NO_ACTIVE_BUDGET',
        baseMinor: null,
        remainingBaseMinor: null,
        pendingMinor: 15n,
      });
    });
  });

  describe('BR-MF1-06g(3)(iv), US-06-12 AC-9: the quote is no longer valid', () => {
    it('is blocked with PRICE_EXPIRED even when the money is there', () => {
      expect(check(10n, {}, true)).toMatchObject({ outcome: 'BLOCKED', blockReasons: ['PRICE_EXPIRED'] });
    });

    it('keeps every reason, the data first: the quote, then the budget', () => {
      expect(check(36n, {}, true).blockReasons).toEqual(['PRICE_EXPIRED', 'OVER_RESERVE']);
      expect(check(1n, { budget: null }, true).blockReasons).toEqual(['PRICE_EXPIRED', 'NO_APPROVED_BUDGET']);
    });
  });

  describe('BR-MF1-07f: what is left may be negative', () => {
    it('is blocked for a request of 1 when what is left with the reserve is already negative', () => {
      expect(check(1n, { budget: budget({ heldMinor: 60n }) })).toMatchObject({
        outcome: 'BLOCKED',
        blockReasons: ['OVER_RESERVE'],
      });
    });
  });

  describe('A5-2 (QĐ-109b): a request that costs nothing this year', () => {
    it('is within the base whatever is left, even when it is negative: nothing is deducted and it still reaches the approver', () => {
      const result = check(0n, { budget: budget({ heldMinor: 90n }) });

      expect(result).toMatchObject({
        outcome: 'WITHIN_BASE',
        blockReasons: [],
        overBaseByMinor: null,
        overByMinor: null,
      });
      expect(result.years[0].remainingWithReserveMinor).toBe(-35n);
      expect(result.route).toBe('SPEND_APPROVAL');
    });

    it('is still blocked when the year has no approved version, or the quote is no longer valid', () => {
      expect(check(0n, { budget: null }).blockReasons).toEqual(['NO_APPROVED_BUDGET']);
      expect(check(0n, {}, true).blockReasons).toEqual(['PRICE_EXPIRED']);
    });
  });

  describe('W3-08: running uncommitted K2 cost is deducted from remaining base and remaining with reserve', () => {
    it('SPEC-B1 case 13: base 132.000.000, spent 60.000.000, held 50.000.000, pending 10.000.000, runningUncommitted 4.500.000 -> remaining 7.500.000 (same for submission and approval)', () => {
      const slice: YearSlice = {
        year: 2027,
        costMinor: 7_500_000n,
        pendingMinor: 10_000_000n,
        budget: {
          versionId: 'v-2027',
          baseMinor: 132_000_000n,
          reserveMinor: 0n,
          heldMinor: 50_000_000n,
          spentMinor: 60_000_000n,
          runningUncommittedMinor: 4_500_000n,
        },
      };

      const onSubmission = checkBudget({ slice, priceExpired: false });
      const onApproval = checkBudget({ slice, priceExpired: false });

      expect(onSubmission.years[0].remainingBaseMinor).toBe(7_500_000n);
      expect(onSubmission.years[0].remainingWithReserveMinor).toBe(7_500_000n);
      expect(onSubmission.outcome).toBe('WITHIN_BASE');
      expect(onApproval).toEqual(onSubmission);

      const overByOne = checkBudget({ slice: { ...slice, costMinor: 7_500_001n }, priceExpired: false });
      expect(overByOne.outcome).toBe('BLOCKED');
      expect(overByOne.blockReasons).toEqual(['OVER_RESERVE']);
      expect(overByOne.overByMinor).toBe(1n);
    });

    it('deducts runningUncommittedMinor before applying reserve when base is exceeded', () => {
      const result = check(21n, {
        budget: budget({ runningUncommittedMinor: 5n }),
      });

      expect(result.years[0].remainingBaseMinor).toBe(20n);
      expect(result.years[0].remainingWithReserveMinor).toBe(30n);
      expect(result.outcome).toBe('USES_RESERVE');
      expect(result.overBaseByMinor).toBe(1n);
    });
  });

  describe('the codes a check carries', () => {
    it('gives the data first, then the code of the year', () => {
      expect(codesOf(check(36n, {}, true))).toEqual(['STALE_COST_EVIDENCE', 'INSUFFICIENT_BUDGET']);
      expect(codesOf(check(1n))).toEqual(['BUDGET_OK']);
    });
  });
});

describe('the route of a check on the wire: the review by Finance is gone (AUDIT §3)', () => {
  it('tells a check made before that went to Finance as the spend approval it led to, or as blocked', () => {
    expect(wireRouteOf('FINANCE_REVIEW', 'WITHIN_BASE')).toBe('SPEND_APPROVAL');
    expect(wireRouteOf('FINANCE_REVIEW', 'USES_RESERVE')).toBe('SPEND_APPROVAL');
    expect(wireRouteOf('FINANCE_REVIEW', 'BLOCKED')).toBe('BLOCKED');
  });

  it('keeps the two routes of today as they are', () => {
    expect(wireRouteOf('BLOCKED', 'BLOCKED')).toBe('BLOCKED');
    expect(wireRouteOf('SPEND_APPROVAL', 'USES_RESERVE')).toBe('SPEND_APPROVAL');
  });
});

describe('QĐ-111an, S-1: the cost of a request is its amount in dong, as it stands', () => {
  it('takes an amount in dong as the cost, with nothing to convert', () => {
    expect(costInDong({ amountMinor: 254_000n, currency: 'VND' })).toEqual({ amountMinor: 254_000n, currency: 'VND' });
  });

  it('judges no amount left in another currency: nothing converts it, so the request has no cost to check', () => {
    expect(costInDong({ amountMinor: 1_000n, currency: 'USD' })).toBeNull();
  });
});

describe('BudgetCheckRepo.pendingForItem SQL scope (D-11, QĐ-117k(1))', () => {
  const CC_ID = '00000000-0000-4000-8000-0000000000c1';
  const REQ_2 = '00000000-0000-4000-8000-000000000002';
  const TICKET_1 = '00000000-0000-4000-8000-000000000101';
  const TICKET_2 = '00000000-0000-4000-8000-000000000102';

  interface SqlNode {
    strings: readonly string[];
    values: readonly unknown[];
  }

  function flattenSql(part: SqlNode): { text: string; values: unknown[] } {
    let text = part.strings[0] ?? '';
    const flatValues: unknown[] = [];
    for (let i = 0; i < part.values.length; i += 1) {
      const val = part.values[i];
      if (val !== null && typeof val === 'object' && 'strings' in val && 'values' in val) {
        const sub = flattenSql(val as SqlNode);
        text += sub.text;
        flatValues.push(...sub.values);
      } else {
        text += '?';
        flatValues.push(val);
      }
      text += part.strings[i + 1] ?? '';
    }
    return { text, values: flatValues };
  }

  const buildRepo = () => {
    const captured: SqlNode[] = [];
    const queryRaw = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      captured.push({ strings, values });
      return Promise.resolve([{ cost_center_id: CC_ID, year: 2026, total: 1_500_000n }]);
    });
    const repo = new BudgetCheckRepo({ $queryRaw: queryRaw } as unknown as PrismaService);
    return { repo, captured };
  };

  it('pendingFor emits no ticket exclusion', async () => {
    const { repo, captured } = buildRepo();

    expect(await repo.pendingFor(CC_ID, 2026, REQ_2)).toBe(1_500_000n);
    const { text, values } = flattenSql(captured[0]);

    expect(text).not.toContain('IS DISTINCT FROM');
    expect(text).not.toContain('ticket_position');
    expect(values).toEqual([CC_ID, 2026, REQ_2, REQ_2]);
  });

  it('pendingForItem with ticket = null (standalone) omits ticket exclusion', async () => {
    const { repo, captured } = buildRepo();

    await repo.pendingForItem(CC_ID, 2026, { id: REQ_2, ticket: null });
    const { text, values } = flattenSql(captured[0]);

    expect(text).not.toContain('IS DISTINCT FROM');
    expect(values).toEqual([CC_ID, 2026, REQ_2, REQ_2]);
  });

  it('pendingForItem with ticket emits same-ticket earlier-position exclusion only on branch 2', async () => {
    const { repo, captured } = buildRepo();

    await repo.pendingForItem(CC_ID, 2026, { id: REQ_2, ticket: { id: TICKET_1, position: 2 } });
    const { text, values } = flattenSql(captured[0]);

    expect(text).toContain("s.kind = 'SPEND_APPROVAL' AND s.state IN ('PENDING', 'WAITING')");
    expect(text).toContain("r.state = 'AWAITING_SPEND_SUBMISSION' AND latest.outcome = 'USES_RESERVE'");
    expect(text).toContain('r.ticket_id IS DISTINCT FROM ?::uuid OR r.ticket_position >= ?::int');
    expect(values).toEqual([CC_ID, 2026, REQ_2, REQ_2, TICKET_1, 2]);
  });

  it.each([
    {
      name: 'excludes earlier item of same ticket',
      row: { ticketId: TICKET_1, ticketPosition: 1 },
      caller: { ticketId: TICKET_1, position: 2 },
      included: false,
    },
    {
      name: 'includes later item of same ticket',
      row: { ticketId: TICKET_1, ticketPosition: 3 },
      caller: { ticketId: TICKET_1, position: 2 },
      included: true,
    },
    {
      name: 'includes item of another ticket',
      row: { ticketId: TICKET_2, ticketPosition: 1 },
      caller: { ticketId: TICKET_1, position: 2 },
      included: true,
    },
    {
      name: 'includes standalone item (ticket_id = NULL)',
      row: { ticketId: null, ticketPosition: null },
      caller: { ticketId: TICKET_1, position: 2 },
      included: true,
    },
  ])('predicate semantics: $name', ({ row, caller, included }) => {
    const matchesPredicate =
      row.ticketId !== caller.ticketId || (row.ticketPosition !== null && row.ticketPosition >= caller.position);
    expect(matchesPredicate).toBe(included);
  });
});
