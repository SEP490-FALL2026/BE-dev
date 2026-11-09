import { heldOf, planRelease, planRemainder, type CommitmentRow } from './commitment-release.policy';

const held = (year: number, amountMinor: bigint, releasedMinor = 0n, appliedMinor = 0n): CommitmentRow => ({
  id: `c${year}`,
  year,
  amountMinor,
  releasedMinor,
  appliedMinor,
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

    it('refuses to give back what was released whole (AC-4)', () => {
      const released: CommitmentRow = { ...held(2026, 60n, 60n), state: 'RELEASED' };

      expect(planRelease([released], [{ year: 2026, amountMinor: 1n }])).toMatchObject({
        ok: false,
        refusal: 'NOT_HELD',
      });
    });

    it('gives back nothing of a commitment that is an expense, without refusing the rest (AC-9)', () => {
      const expensed: CommitmentRow = { ...held(2026, 60n, 0n, 60n), state: 'EXPENSED' };

      expect(planRelease([expensed], [{ year: 2026, amountMinor: 15n }])).toEqual({ ok: true, items: [] });
      expect(
        planRelease(
          [expensed, held(2027, 60n)],
          [
            { year: 2026, amountMinor: 15n },
            { year: 2027, amountMinor: 15n },
          ],
        ),
      ).toEqual({ ok: true, items: [{ id: 'c2027', year: 2027, takeMinor: 15n, leftMinor: 45n }] });
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

describe('what is held once something became an expense (US-06-06 AC-4, AC-9)', () => {
  it('holds the amount less what went back and less what became an expense', () => {
    expect(heldOf(held(2026, 20_000n))).toBe(20_000n);
    expect(heldOf(held(2026, 20_000n, 3_000n))).toBe(17_000n);
    expect(heldOf(held(2026, 20_000n, 0n, 12_000n))).toBe(8_000n);
    expect(heldOf(held(2026, 20_000n, 3_000n, 12_000n))).toBe(5_000n);
  });

  it('gives back only the part that is not an expense when the request ends (A9: 20 with 12 expensed gives back 8)', () => {
    const plan = planRelease([held(2026, 20_000n, 0n, 12_000n)]);

    expect(plan).toEqual({ ok: true, items: [{ id: 'c2026', year: 2026, takeMinor: 8_000n, leftMinor: 0n }] });
  });

  it('lets Finance let go only the part that is not an expense', () => {
    const plan = planRemainder(held(2026, 20_000n, 0n, 12_000n), 'Not needed any more');

    expect(plan).toEqual({ ok: true, items: [{ id: 'c2026', year: 2026, takeMinor: 8_000n, leftMinor: 0n }] });
  });

  it('gives back only what is held when a share reaches into what became an expense (a person of a group leaves)', () => {
    const plan = planRelease([held(2026, 20_000n, 0n, 18_000n)], [{ year: 2026, amountMinor: 5_000n }]);

    expect(plan).toEqual({ ok: true, items: [{ id: 'c2026', year: 2026, takeMinor: 2_000n, leftMinor: 0n }] });
  });

  it('still refuses a share larger than the commitment could ever hold, expense or not', () => {
    const rows = [held(2026, 20_000n, 4_000n, 12_000n)];

    expect(planRelease(rows, [{ year: 2026, amountMinor: 16_000n }])).toMatchObject({ ok: true });
    expect(planRelease(rows, [{ year: 2026, amountMinor: 16_001n }])).toEqual({
      ok: false,
      refusal: 'EXCEEDS_HELD',
      year: 2026,
    });
  });

  it('names a year twice as a repetition even when the first gives back nothing', () => {
    const expensed: CommitmentRow = { ...held(2026, 60n, 0n, 60n), state: 'EXPENSED' };

    expect(
      planRelease(
        [expensed],
        [
          { year: 2026, amountMinor: 1n },
          { year: 2026, amountMinor: 1n },
        ],
      ),
    ).toEqual({ ok: false, refusal: 'YEAR_REPEATED', year: 2026 });
  });

  it('keeps what is left held after a part is given back', () => {
    const plan = planRelease([held(2026, 20_000n, 0n, 12_000n)], [{ year: 2026, amountMinor: 3_000n }]);

    expect(plan).toEqual({ ok: true, items: [{ id: 'c2026', year: 2026, takeMinor: 3_000n, leftMinor: 5_000n }] });
  });
});
