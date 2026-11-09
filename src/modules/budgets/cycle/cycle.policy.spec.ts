import {
  ceilingTotal,
  changedCeilings,
  changesNumbers,
  cycleAcceptsWork,
  departmentsToTell,
  isPastYear,
  judgePublish,
  leavesUnexplained,
  windowOf,
} from './cycle.policy';

const ceiling = (departmentId: string, total: bigint, published: bigint | null = null) => ({
  departmentId,
  signedCommitmentsMinor: total,
  plannedSeatsMinor: 0n,
  priorityMinor: 0n,
  totalMinor: total,
  publishedTotalMinor: published,
  explanation: null as string | null,
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
    const explained = (departmentId: string, total: bigint) => ({
      ...ceiling(departmentId, total),
      explanation: 'basis',
    });
    const base = {
      departmentIds: ['a', 'b'],
      ceilings: [explained('a', 40n), explained('b', 50n)],
      annualCeilingMinor: 100n,
    };

    it('accepts a division that adds up to the annual ceiling exactly, and a zero reserve', () => {
      expect(judgePublish({ ...base, reserveMinor: 10n })).toEqual({ kind: 'OK', totalMinor: 100n });
      expect(judgePublish({ ...base, ceilings: [explained('a', 40n), explained('b', 60n)], reserveMinor: 0n })).toEqual(
        {
          kind: 'OK',
          totalMinor: 100n,
        },
      );
    });

    it('refuses a division one unit over the annual ceiling, and says by how much', () => {
      expect(judgePublish({ ...base, reserveMinor: 11n })).toEqual({ kind: 'OVER_ANNUAL', gapMinor: 1n });
    });

    it('refuses a division with a department missing, a ceiling for a department that left, or no reserve entered', () => {
      expect(judgePublish({ ...base, ceilings: [explained('a', 40n)], reserveMinor: 10n })).toEqual({
        kind: 'INCOMPLETE',
        missingDepartmentIds: ['b'],
        staleDepartmentIds: [],
        explanationMissingDepartmentIds: [],
        reserveMissing: false,
      });
      expect(
        judgePublish({ ...base, ceilings: [...base.ceilings, explained('z', 1n)], reserveMinor: 0n }),
      ).toMatchObject({
        kind: 'INCOMPLETE',
        staleDepartmentIds: ['z'],
      });
      expect(judgePublish({ ...base, reserveMinor: null })).toMatchObject({ kind: 'INCOMPLETE', reserveMissing: true });
    });

    it('refuses a ceiling with no explanation (blank counts as none), and names the departments (W2-N4, QT 4.3)', () => {
      const ceilings = [explained('a', 40n), { ...ceiling('b', 50n), explanation: '   ' }];

      expect(judgePublish({ ...base, ceilings, reserveMinor: 10n })).toMatchObject({
        kind: 'INCOMPLETE',
        explanationMissingDepartmentIds: ['b'],
        missingDepartmentIds: [],
      });
    });
  });

  it('says a division leaves a ceiling unexplained when one has no explanation or a blank one', () => {
    expect(leavesUnexplained([{ explanation: 'a' }, { explanation: 'b' }])).toBe(false);
    expect(leavesUnexplained([{ explanation: 'a' }, { explanation: null }])).toBe(true);
    expect(leavesUnexplained([{ explanation: '  ' }])).toBe(true);
    expect(leavesUnexplained([])).toBe(false);
  });

  describe('whether a change of the division changes a number (R-I04)', () => {
    const figures = { signedCommitmentsMinor: 5n, plannedSeatsMinor: 0n, priorityMinor: 0n, explanation: 'old' };

    it('does not for a new explanation alone', () => {
      expect(changesNumbers([{ before: figures, after: { ...figures, explanation: 'new' } }], false)).toBe(false);
    });

    it('does for a part, the reserve, a department added or one taken out', () => {
      expect(changesNumbers([{ before: figures, after: { ...figures, priorityMinor: 5n } }], false)).toBe(true);
      expect(changesNumbers([], true)).toBe(true);
      expect(changesNumbers([{ before: null, after: figures }], false)).toBe(true);
      expect(changesNumbers([{ before: figures, after: null }], false)).toBe(true);
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
      { departmentId: 'a', signedCommitmentsMinor: 5n, plannedSeatsMinor: 0n, priorityMinor: 0n, explanation: null },
      { departmentId: 'b', signedCommitmentsMinor: 7n, plannedSeatsMinor: 0n, priorityMinor: 0n, explanation: null },
      { departmentId: 'c', signedCommitmentsMinor: 1n, plannedSeatsMinor: 0n, priorityMinor: 0n, explanation: null },
    ];

    expect(changedCeilings(before, after).map((change) => change.departmentId)).toEqual(['b', 'c']);
    expect(changedCeilings(before, after.slice(0, 1)).map((change) => change.departmentId)).toEqual(['b']);
  });

  it('sees a change of the explanation, and of the parts that leaves the total as it was', () => {
    const before = [ceiling('a', 5n)];
    const same = {
      departmentId: 'a',
      signedCommitmentsMinor: 5n,
      plannedSeatsMinor: 0n,
      priorityMinor: 0n,
      explanation: null,
    };

    expect(changedCeilings(before, [same])).toEqual([]);
    expect(changedCeilings(before, [{ ...same, explanation: 'why' }])).toHaveLength(1);
    expect(changedCeilings(before, [{ ...same, signedCommitmentsMinor: 0n, priorityMinor: 5n }])).toHaveLength(1);
  });
});

describe('windowOf (the window a department may be made in, QĐ-104e(3), R-I10)', () => {
  it('opens on 1 January of next year while the cycle of that year was never published', () => {
    expect(windowOf({ nextYear: 2027, nextCycle: { neverPublished: true }, anyCycle: true })).toEqual({
      kind: 'OPEN',
      effectiveFrom: '2027-01-01',
    });
  });

  it('is closed once next year was published (even when it was taken back to be changed)', () => {
    expect(windowOf({ nextYear: 2027, nextCycle: { neverPublished: false }, anyCycle: true })).toEqual({
      kind: 'CLOSED',
    });
  });

  it('is not opened by the cycle of this year: no department is made in the middle of a year', () => {
    expect(windowOf({ nextYear: 2027, nextCycle: null, anyCycle: true })).toEqual({ kind: 'CLOSED' });
  });

  it('leaves an organization with no cycle at all to the installation', () => {
    expect(windowOf({ nextYear: 2027, nextCycle: null, anyCycle: false })).toEqual({ kind: 'NO_CYCLE_YET' });
  });
});
