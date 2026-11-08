import {
  ceilingTotal,
  changedCeilings,
  cycleAcceptsWork,
  departmentsToTell,
  isPastYear,
  judgePublish,
} from './cycle.policy';

const ceiling = (departmentId: string, total: bigint, published: bigint | null = null) => ({
  departmentId,
  signedCommitmentsMinor: total,
  plannedSeatsMinor: 0n,
  priorityMinor: 0n,
  totalMinor: total,
  publishedTotalMinor: published,
});

describe('the budget cycle policy (QĐ-103i)', () => {
  it('sums the three parts of a ceiling', () => {
    expect(ceilingTotal({ signedCommitmentsMinor: 1n, plannedSeatsMinor: 2n, priorityMinor: 3n })).toBe(6n);
  });

  it('writes only the current year and the years to come (B7)', () => {
    expect(isPastYear(2025, 2026)).toBe(true);
    expect(isPastYear(2026, 2026)).toBe(false);
    expect(isPastYear(2027, 2026)).toBe(false);
  });

  describe('whether a division can be published (R-I04, QT 4.3)', () => {
    const base = {
      departmentIds: ['a', 'b'],
      ceilings: [ceiling('a', 40n), ceiling('b', 50n)],
      annualCeilingMinor: 100n,
    };

    it('accepts a division that adds up to the annual ceiling exactly, and a zero reserve', () => {
      expect(judgePublish({ ...base, reserveMinor: 10n })).toEqual({ kind: 'OK', totalMinor: 100n });
      expect(judgePublish({ ...base, ceilings: [ceiling('a', 40n), ceiling('b', 60n)], reserveMinor: 0n })).toEqual({
        kind: 'OK',
        totalMinor: 100n,
      });
    });

    it('refuses a division one unit over the annual ceiling, and says by how much', () => {
      expect(judgePublish({ ...base, reserveMinor: 11n })).toEqual({ kind: 'OVER_ANNUAL', gapMinor: 1n });
    });

    it('refuses a division with a department missing, a ceiling for a department that left, or no reserve entered', () => {
      expect(judgePublish({ ...base, ceilings: [ceiling('a', 40n)], reserveMinor: 10n })).toEqual({
        kind: 'INCOMPLETE',
        missingDepartmentIds: ['b'],
        staleDepartmentIds: [],
        reserveMissing: false,
      });
      expect(judgePublish({ ...base, ceilings: [...base.ceilings, ceiling('z', 1n)], reserveMinor: 0n })).toMatchObject(
        {
          kind: 'INCOMPLETE',
          staleDepartmentIds: ['z'],
        },
      );
      expect(judgePublish({ ...base, reserveMinor: null })).toMatchObject({ kind: 'INCOMPLETE', reserveMissing: true });
    });
  });

  it('tells every department at the first publication and later only those whose total changed', () => {
    expect(departmentsToTell([ceiling('b', 5n), ceiling('a', 5n)])).toEqual(['a', 'b']);
    expect(departmentsToTell([ceiling('a', 5n, 5n), ceiling('b', 6n, 5n)])).toEqual(['b']);
  });

  it('accepts proposals once the cycle was published for the first time, and keeps accepting them after it is unpublished', () => {
    expect(cycleAcceptsWork({ firstPublishedAt: null })).toBe(false);
    expect(cycleAcceptsWork({ firstPublishedAt: new Date() })).toBe(true);
  });

  it('lists the ceilings that changed, added or removed', () => {
    const before = [ceiling('a', 5n), ceiling('b', 6n)];
    const after = [
      { departmentId: 'a', signedCommitmentsMinor: 5n, plannedSeatsMinor: 0n, priorityMinor: 0n },
      { departmentId: 'b', signedCommitmentsMinor: 7n, plannedSeatsMinor: 0n, priorityMinor: 0n },
      { departmentId: 'c', signedCommitmentsMinor: 1n, plannedSeatsMinor: 0n, priorityMinor: 0n },
    ];

    expect(changedCeilings(before, after).map((change) => change.departmentId)).toEqual(['b', 'c']);
    expect(changedCeilings(before, after.slice(0, 1)).map((change) => change.departmentId)).toEqual(['b']);
  });
});
