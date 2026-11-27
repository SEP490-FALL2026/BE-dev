import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHARED_DEMO_V4 as F } from '../fixture/shared-demo-v4';
import { baseFor, expectedOf, lastClosedMonth, roundUpTo, tightBaseFor } from './budget-targets';

/*
 * The rules of the light, copied from `budget-review.policy.ts` (the seed cannot import a module: arch:check). The copy in this file judges what the copy of
 * `budget-targets.ts` chose, and a text test below catches a policy that moved.
 */
const paceOf = (spent: bigint, base: bigint, month: number): bigint | null => {
  if (base <= 0n) return null;
  const scheduled = base * BigInt(month);

  return (spent * 12n * 10_000n + scheduled - 1n) / scheduled;
};

const lightOf = (input: { month: number; base: bigint; reserve: bigint; forecast: bigint; pace: bigint | null }) => {
  if (input.forecast > input.base + input.reserve) return 'RED';
  if (input.forecast > input.base || (input.pace !== null && input.pace > 11_000n)) return 'YELLOW';
  if (input.month >= 6 && input.forecast * 100n < 70n * input.base) return 'UNDER';

  return 'GREEN';
};

it('covers both provisional group lines before the spending approver rejects one, with the default Board reserve', () => {
  for (const today of ['2026-10-01', '2026-11-18', '2026-12-31']) {
    const group = F.requests.find((request) => request.key === 'R49')!;
    const subscription = F.subscriptions.find((subscription) => subscription.plan === group.plan)!;
    const months = 12 - Number(today.slice(5, 7)) + 1;
    const provisional =
      Math.floor((Number(subscription.unitPrice!.amount) + 6) / 12) * months * group.beneficiaries!.length;
    const choice = baseFor(F, 'BOD', today)!;
    const { pending } = expectedOf(F, 'BOD', today);
    expect(choice.reservePercent).toBe(10);
    expect(choice.base * 1.1).toBeGreaterThanOrEqual(pending + provisional);
    expect(choice.light).toBe('GREEN');
  }
});

it('reads per-line monthly prices from lines[] when estimating requests on multi-line subscriptions (W3-28)', () => {
  const multi = (plan: 'claude-team-standard' | 'claude-team-premium') => ({
    ...F,
    requests: [
      {
        key: 'RM',
        requester: 'NV-DEV5',
        plan,
        termMonths: 1,
        target: 'AWAITING_EXECUTION' as const,
        summary: 'x',
        reason: 'x',
      },
    ],
  });

  expect(expectedOf(multi('claude-team-standard'), 'ENG', '2026-11-01').committed).toBe(500_000);
  expect(expectedOf(multi('claude-team-standard'), 'ENG', '2026-11-17').committed).toBe(1_000_000);
  expect(expectedOf(multi('claude-team-premium'), 'ENG', '2026-11-01').committed).toBe(2_500_000);
});

const DAYS = ['2026-11-17', '2026-10-01', '2026-12-31'];

describe('the month the latest review closes (T9b)', () => {
  it('is the month before the day of the seed, never past October (the closes of demo.budget-reviews)', () => {
    expect(lastClosedMonth('2026-11-17')).toBe(10);
    expect(lastClosedMonth('2026-12-31')).toBe(10);
    expect(lastClosedMonth('2026-10-01')).toBe(9);
    expect(lastClosedMonth('2026-05-10')).toBe(4);
    expect(lastClosedMonth('2026-01-05')).toBe(0);
  });
});

/**
 * What the first real seed showed (CP1, 18/11): a person the seed creates is placed from the day of the seed, so no seat has cost any department a month that
 * already ended and the review lines show spent = 0. What a department has is what its requests hold and wait for.
 */
describe('what a department is expected to have spent, held and waiting (expectedOf)', () => {
  it('counts the seats of the pool through the month before the day of the seed', () => {
    expect(expectedOf(F, 'FIN', '2026-11-17')).toMatchObject({ month: 10 });
    expect(expectedOf(F, 'FIN', '2026-10-01')).toMatchObject({ month: 9 });
  });

  it('charges no seat for a month that ended before the day of the seed: its holder was placed in the department that day', () => {
    for (const department of ['ENG', 'ITO', 'BOD', 'FIN']) {
      for (const today of DAYS) expect(expectedOf(F, department, today).spentThrough).toBe(0);
    }
  });

  it('has nothing spent in the months before the first of the year of the seed', () => {
    expect(expectedOf(F, 'FIN', '2026-01-05')).toMatchObject({ month: 0, spentThrough: 0 });
  });

  it('puts the cost of a request in the department of its requester, held once it is decided and waiting while it is not', () => {
    const none = expectedOf({ ...F, requests: [] }, 'ENG', '2026-11-17');
    const withRequests = expectedOf(F, 'ENG', '2026-11-17');

    expect(withRequests.committed + withRequests.pending).toBeGreaterThan(none.committed + none.pending);
    expect(none.committed + none.pending).toBe(0);
  });
});

/** Requests of the Board and of Finance of the kind T12 brings, so the lights of those two can be counted for. */
const request = (key: string, requester: string, target: 'COMPLETED' | 'AWAITING_SPEND_DECISION') => ({
  key,
  requester,
  plan: 'chatgpt-plus',
  termMonths: 9,
  target,
  summary: 'x',
  reason: 'x',
});
const headedBy = (code: string) => F.people.find((person) => person.code === code)?.department;
/** The fixture as it was before T12: no request or baseline seat of the Board or Finance, so those two have nothing counted yet. */
const WITHOUT_BOARD_AND_FINANCE = {
  ...F,
  seats: F.seats.filter((seat) => !['BOD', 'FIN'].includes(headedBy(seat.holder) ?? '')),
  requests: F.requests.filter((candidate) => !['BOD', 'FIN'].includes(headedBy(candidate.requester) ?? '')),
};
const WITH_BOARD_AND_FINANCE = {
  ...F,
  requests: [
    ...WITHOUT_BOARD_AND_FINANCE.requests,
    request('RB1', 'NV-BOD1', 'COMPLETED'),
    request('RB2', 'NV-BOD2', 'COMPLETED'),
    request('RB3', 'NV-BOD1', 'AWAITING_SPEND_DECISION'),
    request('RF1', 'NV-FIN2', 'COMPLETED'),
    request('RF2', 'NV-FIN2', 'AWAITING_SPEND_DECISION'),
  ],
};

describe('the base counted for the light a department must show (baseFor, SPEC S24 item 1)', () => {
  const lightAt = (fixture: typeof F, department: string, today: string) => {
    const choice = baseFor(fixture, department, today)!;
    const expected = expectedOf(fixture, department, today);
    const forecast = BigInt(
      expected.spentThrough + expected.runningUncommitted + expected.committed + expected.pending,
    );
    const base = BigInt(choice.base);
    const reserve = (base * BigInt(choice.reservePercent)) / 100n;

    return lightOf({
      month: expected.month,
      base,
      reserve,
      forecast,
      pace: paceOf(BigInt(expected.spentThrough), base, expected.month),
    });
  };

  it.each(DAYS)(
    'gives the four departments the four lights of the table on %s once the Board and Finance have requests',
    (today) => {
      expect(lightAt(WITH_BOARD_AND_FINANCE, 'ENG', today)).toBe('UNDER');
      expect(lightAt(WITH_BOARD_AND_FINANCE, 'BOD', today)).toBe('GREEN');
      expect(lightAt(WITH_BOARD_AND_FINANCE, 'FIN', today)).toBe('YELLOW');
      for (const department of ['ENG', 'BOD', 'FIN']) {
        expect(baseFor(WITH_BOARD_AND_FINANCE, department, today)).toMatchObject({ reachable: true });
      }
    },
  );

  it('keeps the amount of the fixture while nothing is counted for a department, and says that its light cannot be reached', () => {
    for (const today of DAYS) {
      expect(baseFor(WITHOUT_BOARD_AND_FINANCE, 'BOD', today)).toMatchObject({
        base: 50_000_000,
        light: 'UNDER',
        reachable: false,
      });
      expect(baseFor(WITHOUT_BOARD_AND_FINANCE, 'FIN', today)).toMatchObject({
        base: 50_000_000,
        light: 'UNDER',
        reachable: false,
      });
    }
  });

  it.each(DAYS)(
    'gives the four departments their four lights with the requests of the fixture itself on %s (T12, CP2: D-9)',
    (today) => {
      for (const [department, light] of [
        ['ENG', 'UNDER'],
        ['ITO', 'UNDER'],
        ['BOD', 'GREEN'],
        ['FIN', 'YELLOW'],
      ] as const) {
        expect(lightAt(F, department, today)).toBe(light);
        expect(baseFor(F, department, today)).toMatchObject({ reachable: true, wanted: light });
      }
    },
  );

  it('counts the people the spending approver refuses out of what a group request holds (R49: only NV-BOD1 is granted)', () => {
    const group = (rejectedLines?: string[]) => ({
      ...F,
      requests: [
        {
          key: 'RG',
          requester: 'NV-DEP',
          beneficiaries: ['NV-BOD1', 'NV-BOD2'],
          plan: 'm365-standard',
          termMonths: 1,
          target: 'AWAITING_EXECUTION' as const,
          ...(rejectedLines ? { rejectedLines } : {}),
          summary: 'x',
          reason: 'x',
        },
      ],
    });
    const price = Math.floor((3_800_000 + 6) / 12);

    expect(expectedOf(group(), 'BOD', '2026-11-01').committed).toBe(price * 2);
    expect(expectedOf(group(['NV-BOD2']), 'BOD', '2026-11-01').committed).toBe(price);
    expect(expectedOf(group(['NV-BOD2']), 'BOD', '2026-11-17').committed).toBe(price * 2);
  });

  it('asks the reserve of Finance at 60 % and the others at the default, and asks nothing of a department it does not count', () => {
    expect(baseFor(F, 'FIN', '2026-11-17')).toMatchObject({ reservePercent: 60 });
    expect(baseFor(F, 'ENG', '2026-11-17')).toMatchObject({ reservePercent: 10 });
    for (const department of ['MKT', 'SAL', 'DES']) expect(baseFor(F, department, '2026-11-17')).toBeNull();
  });

  it('rounds the base up to a whole million when that keeps the light, and to a finer step when it would not', () => {
    for (const department of ['ENG', 'BOD', 'FIN']) {
      const choice = baseFor(WITH_BOARD_AND_FINANCE, department, '2026-11-17')!;

      expect(choice.base % 1_000).toBe(0);
    }
    expect(baseFor(WITH_BOARD_AND_FINANCE, 'ENG', '2026-11-17')!.base % 1_000_000).toBe(0);
    expect(roundUpTo(10_000_001, 1_000_000)).toBe(11_000_000);
    expect(roundUpTo(10_000_000, 1_000_000)).toBe(10_000_000);
  });

  it('keeps ENG at its BM-10 lines or more, wide enough to give up 5 million on the next day and still cover the forecast and the Figma request of MF-4', () => {
    for (const today of DAYS) {
      const choice = baseFor(F, 'ENG', today)!;
      const expected = expectedOf(F, 'ENG', today);
      const forecast = expected.spentThrough + expected.runningUncommitted + expected.committed + expected.pending;
      const monthsLeft = 12 - Number(today.slice(5, 7)) + 1;

      expect(choice.base).toBeGreaterThanOrEqual(185_000_000);
      expect(choice.base - 5_000_000).toBeGreaterThanOrEqual(forecast);
      expect(choice.base - 5_000_000 - forecast).toBeGreaterThanOrEqual(375_000 * monthsLeft);
    }
  });

  it('keeps Finance in yellow with a forecast above the base and within the base and its 60 % reserve', () => {
    for (const today of DAYS) {
      const choice = baseFor(WITH_BOARD_AND_FINANCE, 'FIN', today)!;
      const expected = expectedOf(WITH_BOARD_AND_FINANCE, 'FIN', today);
      const forecast = expected.spentThrough + expected.runningUncommitted + expected.committed + expected.pending;

      expect(forecast).toBeGreaterThan(choice.base);
      expect(forecast).toBeLessThanOrEqual(choice.base * 1.6);
    }
  });

  it('does not throw when the day is too early for a light to be reached: it says which is not reached', () => {
    const early = baseFor(F, 'ENG', '2026-05-10')!;

    expect(early.reachable).toBe(false);
    expect(early.base).toBeGreaterThan(0);
    expect(() => baseFor(F, 'FIN', '2026-01-05')).not.toThrow();
    expect(baseFor(WITH_BOARD_AND_FINANCE, 'BOD', '2026-05-10')).toMatchObject({ reachable: true });
  });

  it('names the departments of the fixture that carry a light, and no other', () => {
    expect(
      F.budgets
        .filter((budget) => budget.light !== undefined)
        .map((budget) => budget.department)
        .sort(),
    ).toEqual(['BOD', 'ENG', 'FIN', 'ITO']);
    expect(F.budgets.find((budget) => budget.department === 'FIN')!.reserve).toMatchObject({ percent: 60 });
  });

  it('H-2: sizes MKT and DES reserve bases inside (forecast / 1.1, forecast) across calendar months and baseline seats, leaving SAL blocked', () => {
    for (const today of ['2026-10-01', '2026-11-26', '2026-12-31']) {
      for (const department of ['MKT', 'DES'] as const) {
        const base = tightBaseFor(F, department, today)!;
        const expected = expectedOf(F, department, today);
        const forecast = expected.spentThrough + expected.runningUncommitted + expected.committed + expected.pending;

        expect(base).toBeGreaterThan(0);
        expect(forecast).toBeGreaterThan(base);
        expect(forecast).toBeLessThanOrEqual(Math.floor(base * 1.1));
      }
      expect(tightBaseFor(F, 'SAL', today)).toBeNull();
      const totalWithReserve = F.budgets.reduce((sum, entry) => {
        const chosen =
          baseFor(F, entry.department, today)?.base ?? tightBaseFor(F, entry.department, today) ?? Number(entry.base);
        const pct = entry.reserve?.percent ?? 10;

        return sum + BigInt(chosen) + (BigInt(chosen) * BigInt(pct)) / 100n;
      }, 0n);
      expect(totalWithReserve).toBeLessThanOrEqual(BigInt(F.cycle.annualCeiling) - BigInt(F.cycle.sharedPoolReserve));
    }
  });
});

describe('the rules the copy of the policy stands for', () => {
  const source = readFileSync(join(__dirname, '../../../modules/budgets/review/budget-review.policy.ts'), 'utf8');

  it('still say 110 % of the schedule, June, 70 % of the base, red then yellow then under then green', () => {
    expect(source).toContain('PACE_LIMIT_BASIS_POINTS = 11_000n');
    expect(source).toContain('UNDER_FROM_MONTH = 6');
    expect(source).toContain('UNDER_PERCENT = 70n');
    expect(source).toContain('input.forecastMinor > input.baseMinor + input.reserveMinor');
    expect(source).toContain('input.forecastMinor * 100n < UNDER_PERCENT * input.baseMinor');
    expect(source).toContain('(numerator + scheduled - 1n) / scheduled');
  });
});
