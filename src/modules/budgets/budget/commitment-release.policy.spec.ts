import { planRelease, planRemainder, type CommitmentRow } from './commitment-release.policy';

const held = (year: number, amountMinor: bigint, releasedMinor = 0n): CommitmentRow => ({
  id: `c${year}`,
  year,
  amountMinor,
  releasedMinor,
  state: 'HELD',
});

describe('the money that goes back to the budget', () => {
  describe('planRelease', () => {
    it('gives back everything that is still held, in each year', () => {
      const plan = planRelease([held(2026, 2_400n), held(2027, 2_400n, 400n)]);

      expect(plan).toEqual({
        ok: true,
        items: [
          { id: 'c2026', year: 2026, takeMinor: 2_400n, leftMinor: 0n },
          { id: 'c2027', year: 2027, takeMinor: 2_000n, leftMinor: 0n },
        ],
      });
    });

    it('leaves a commitment that was released or became an expense as it is', () => {
      const rows: CommitmentRow[] = [
        held(2026, 100n),
        { ...held(2027, 100n), state: 'EXPENSED' },
        { ...held(2028, 100n, 100n), state: 'RELEASED' },
      ];

      expect(planRelease(rows)).toEqual({
        ok: true,
        items: [{ id: 'c2026', year: 2026, takeMinor: 100n, leftMinor: 0n }],
      });
    });

    it('has nothing to give back for a request that holds nothing', () => {
      expect(planRelease([])).toEqual({ ok: true, items: [] });
    });

    it('gives back the amounts named and keeps the rest held', () => {
      expect(planRelease([held(2026, 60n)], [{ year: 2026, amountMinor: 15n }])).toEqual({
        ok: true,
        items: [{ id: 'c2026', year: 2026, takeMinor: 15n, leftMinor: 45n }],
      });
    });

    it.each([
      ['a year with no commitment', [{ year: 2030, amountMinor: 1n }], 'NO_COMMITMENT'],
      ['nothing', [{ year: 2026, amountMinor: 0n }], 'AMOUNT_NOT_POSITIVE'],
      ['a negative amount', [{ year: 2026, amountMinor: -1n }], 'AMOUNT_NOT_POSITIVE'],
      ['more than is held', [{ year: 2026, amountMinor: 61n }], 'EXCEEDS_HELD'],
      [
        'a year named twice',
        [
          { year: 2026, amountMinor: 1n },
          { year: 2026, amountMinor: 1n },
        ],
        'YEAR_REPEATED',
      ],
    ])('refuses %s', (_name, amounts, refusal) => {
      expect(planRelease([held(2026, 60n)], amounts)).toMatchObject({ ok: false, refusal });
    });

    it('refuses to give back what is not held (AC-4)', () => {
      const expensed: CommitmentRow = { ...held(2026, 60n), state: 'EXPENSED' };

      expect(planRelease([expensed], [{ year: 2026, amountMinor: 1n }])).toMatchObject({
        ok: false,
        refusal: 'NOT_HELD',
      });
    });
  });

  describe('planRemainder', () => {
    it('lets Finance give back what is left with a reason (AC-6)', () => {
      expect(planRemainder(held(2026, 5_000_000n, 2_000_000n), 'The invoice came in lower')).toEqual({
        ok: true,
        items: [{ id: 'c2026', year: 2026, takeMinor: 3_000_000n, leftMinor: 0n }],
      });
    });

    it.each(['', '   '])('needs a reason, not %p', (reason) => {
      expect(planRemainder(held(2026, 1n), reason)).toEqual({ ok: false, refusal: 'REASON_REQUIRED' });
    });

    it.each(['RELEASED', 'EXPENSED'] as const)('is not for a commitment that is %s', (state) => {
      expect(planRemainder({ ...held(2026, 1n), state }, 'reason')).toMatchObject({ ok: false, refusal: 'NOT_HELD' });
    });
  });
});
