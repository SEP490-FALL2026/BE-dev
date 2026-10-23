import {
  CostAllocationCostCenterDuplicateError,
  CostAllocationLineCountError,
  CostAllocationRatioInvalidError,
  CostAllocationTotalError,
} from '../finance.errors';
import { ALLOCATION_TOTAL_BP, cleanAllocationLines, sameAllocation, toAllocationView } from './cost-allocation.policy';

const A = '0b2f6a1e-1111-4111-8111-000000000001';
const B = '0b2f6a1e-2222-4222-8222-000000000002';
const C = '0b2f6a1e-3333-4333-8333-000000000003';

const line = (costCenterId: string, ratioPercent: string) => ({ costCenterId, ratioPercent });
const centerId = (index: number) => `0b2f6a1e-0000-4000-8000-${String(index).padStart(12, '0')}`;

describe('cleanAllocationLines (INV-03: the shares add up to exactly 100%)', () => {
  it('reads 60% and 40% as 6000 and 4000 hundredths of a percent, for the total of 10 000', () => {
    expect(cleanAllocationLines([line(A, '60'), line(B, '40')])).toEqual([
      { costCenterId: A, ratioBp: 6000 },
      { costCenterId: B, ratioBp: 4000 },
    ]);
    expect(ALLOCATION_TOTAL_BP).toBe(10000);
  });

  it('accepts a single line of 100% and a split in hundredths that adds up (33.33 + 33.33 + 33.34)', () => {
    expect(cleanAllocationLines([line(A, '100')])).toEqual([{ costCenterId: A, ratioBp: 10000 }]);
    expect(cleanAllocationLines([line(A, '33.33'), line(B, '33.33'), line(C, '33.34')]).map((l) => l.ratioBp)).toEqual([
      3333, 3333, 3334,
    ]);
  });

  it('refuses 60% + 30% and names the total it found, 90% (AC-2)', () => {
    expect.assertions(2);
    try {
      cleanAllocationLines([line(A, '60'), line(B, '30')]);
    } catch (error) {
      expect(error).toBeInstanceOf(CostAllocationTotalError);
      expect((error as CostAllocationTotalError).totalBp).toBe(9000);
    }
  });

  it.each([
    ['33.33 three times is 99.99', [line(A, '33.33'), line(B, '33.33'), line(C, '33.33')], 9999],
    ['60 and 50 is 110', [line(A, '60'), line(B, '50')], 11000],
    ['a single 99.99', [line(A, '99.99')], 9999],
  ])('refuses a total other than 100: %s', (_name, lines, total) => {
    expect.assertions(2);
    try {
      cleanAllocationLines(lines);
    } catch (error) {
      expect(error).toBeInstanceOf(CostAllocationTotalError);
      expect((error as CostAllocationTotalError).totalBp).toBe(total);
    }
  });

  it.each(['0', '0.00', '-1', '-0.5', '101', '100.01', '33.333', 'abc', '', ' ', '1e2', '10%'])(
    'refuses the ratio %p, which is not a share from above 0 up to 100 with at most two decimals',
    (ratio) => {
      expect(() => cleanAllocationLines([line(A, ratio), line(B, '50')])).toThrow(CostAllocationRatioInvalidError);
    },
  );

  it('names the Cost Center whose ratio is refused', () => {
    expect.assertions(1);
    try {
      cleanAllocationLines([line(A, '50'), line(B, '0')]);
    } catch (error) {
      expect((error as CostAllocationRatioInvalidError).costCenterId).toBe(B);
    }
  });

  it('refuses no line and more than twenty lines', () => {
    expect(() => cleanAllocationLines([])).toThrow(CostAllocationLineCountError);
    const twentyOne = Array.from({ length: 21 }, (_, index) => line(centerId(index), '1'));
    expect(() => cleanAllocationLines(twentyOne)).toThrow(CostAllocationLineCountError);
  });

  it('accepts twenty lines of 5%', () => {
    const twenty = Array.from({ length: 20 }, (_, index) => line(centerId(index), '5'));

    expect(cleanAllocationLines(twenty)).toHaveLength(20);
  });

  it('refuses a Cost Center twice, also when the ids differ only in case', () => {
    expect(() => cleanAllocationLines([line(A, '60'), line(A, '40')])).toThrow(CostAllocationCostCenterDuplicateError);
    expect(() => cleanAllocationLines([line(A.toUpperCase(), '60'), line(A, '40')])).toThrow(
      CostAllocationCostCenterDuplicateError,
    );
  });

  it('checks the count, then each ratio, then the duplicates, then the total', () => {
    expect(() => cleanAllocationLines([line(A, '0'), line(A, '10')])).toThrow(CostAllocationRatioInvalidError);
    expect(() => cleanAllocationLines([line(A, '10'), line(A, '10')])).toThrow(CostAllocationCostCenterDuplicateError);
    expect(() => cleanAllocationLines([line(A, '10'), line(B, '10')])).toThrow(CostAllocationTotalError);
  });

  it('keeps the lines in the order of the Cost Center ids, whatever order they were entered in', () => {
    expect(cleanAllocationLines([line(B, '40'), line(A, '60')]).map((l) => l.costCenterId)).toEqual([A, B]);
    expect(cleanAllocationLines([line(A.toUpperCase(), '100')])[0].costCenterId).toBe(A);
  });
});

describe('sameAllocation', () => {
  const sixty = cleanAllocationLines([line(A, '60'), line(B, '40')]);

  it('is true for the same Cost Centers and shares, in any order of entry', () => {
    expect(sameAllocation(sixty, cleanAllocationLines([line(B, '40'), line(A, '60')]))).toBe(true);
  });

  it('is false when a share, a Cost Center or the number of lines differs', () => {
    expect(sameAllocation(sixty, cleanAllocationLines([line(A, '50'), line(B, '50')]))).toBe(false);
    expect(sameAllocation(sixty, cleanAllocationLines([line(A, '60'), line(C, '40')]))).toBe(false);
    expect(sameAllocation(sixty, cleanAllocationLines([line(A, '100')]))).toBe(false);
  });
});

describe('toAllocationView', () => {
  const declaredAt = new Date('2026-10-20T03:00:00.000Z');
  const centers = new Map([
    [A, { id: A, code: 'CC-A', name: 'Design', kind: 'UNIT' as const, status: 'ACTIVE' as const }],
    [B, { id: B, code: 'CC-B', name: 'Finance', kind: 'UNIT' as const, status: 'ACTIVE' as const }],
  ]);

  it('shows the shares as percentages with the code, name and kind of each Cost Center, and the total', () => {
    const view = toAllocationView(
      {
        subscriptionId: 's1',
        version: 3,
        lines: [
          { costCenterId: A, ratioBp: 6050 },
          { costCenterId: B, ratioBp: 3950 },
        ],
        declaredByAppUserId: 'u1',
        declaredAt,
      },
      centers,
    );

    expect(view).toEqual({
      version: 3,
      lines: [
        {
          costCenterId: A,
          costCenterCode: 'CC-A',
          costCenterName: 'Design',
          costCenterKind: 'UNIT',
          ratioPercent: '60.5',
        },
        {
          costCenterId: B,
          costCenterCode: 'CC-B',
          costCenterName: 'Finance',
          costCenterKind: 'UNIT',
          ratioPercent: '39.5',
        },
      ],
      totalPercent: '100',
      declaredBy: 'u1',
      declaredAt,
    });
  });

  it('refuses a version that names a Cost Center nobody read: that is a bug, not an answer', () => {
    expect(() =>
      toAllocationView(
        {
          subscriptionId: 's1',
          version: 1,
          lines: [{ costCenterId: C, ratioBp: 10000 }],
          declaredByAppUserId: 'u1',
          declaredAt,
        },
        centers,
      ),
    ).toThrow();
  });
});
