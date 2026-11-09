import {
  STALE_AFTER_DAYS,
  ageDaysOf,
  canConcludeAbsence,
  detectableGroupsOf,
  distinctSorted,
  isStale,
  weakestMethod,
} from './usage-evidence.policy';

describe('DA6-09: the freshness of a source is a constant of its kind (QĐ-101b)', () => {
  it('a vendor is stale after 7 days and a collector after 14', () => {
    expect(STALE_AFTER_DAYS).toEqual({ VENDOR: 7, COLLECTOR: 14 });
    const asVendor = ageDaysOf('2026-09-01', '2026-09-09');
    expect(asVendor).toBe(8);
    expect(isStale('VENDOR', asVendor)).toBe(true);
    expect(isStale('VENDOR', 7)).toBe(false);
  });

  it('US-10-02 AC-14: a collector last seen on 01/09 is fresh on 12/09 and stale on 16/09', () => {
    expect(isStale('COLLECTOR', ageDaysOf('2026-09-01', '2026-09-12'))).toBe(false);
    expect(isStale('COLLECTOR', ageDaysOf('2026-09-01', '2026-09-14'))).toBe(false);
    expect(isStale('COLLECTOR', ageDaysOf('2026-09-01', '2026-09-16'))).toBe(true);
  });
});

describe('DA6-14: when an absence can be read as not used', () => {
  const full = { direction: 'POSITIVE_AND_NEGATIVE' as const, capLastActivity: true, capEventDetail: false };

  it('a vendor that tells the negative and the days can; the other cases, and any collector, cannot', () => {
    expect(canConcludeAbsence('VENDOR', full)).toBe(true);
    expect(canConcludeAbsence('VENDOR', { ...full, direction: 'POSITIVE_ONLY' })).toBe(false);
    expect(canConcludeAbsence('VENDOR', { ...full, capLastActivity: false })).toBe(false);
    expect(canConcludeAbsence('COLLECTOR', full)).toBe(false);
  });

  it('FR-4.4: a vendor that only lists members detects G1 and G2', () => {
    expect(detectableGroupsOf({ capMemberList: true, capLastActivity: false, capEventDetail: false })).toEqual([
      'G1',
      'G2',
    ]);
    expect(detectableGroupsOf({ capMemberList: true, capLastActivity: true, capEventDetail: false })).toEqual([
      'G1',
      'G2',
      'G3',
      'G4',
    ]);
  });
});

describe('what is said of a person', () => {
  it('the weakest way an identifier was tied: an alias is weaker than an exact email, and a tie by hand the strongest', () => {
    expect(weakestMethod(['EXACT_EMAIL', 'ALIAS_RULE', 'MANUAL'])).toBe('ALIAS_RULE');
    expect(weakestMethod(['MANUAL', 'EXACT_EMAIL'])).toBe('EXACT_EMAIL');
    expect(weakestMethod(['MANUAL'])).toBe('MANUAL');
    expect(weakestMethod([])).toBeNull();
  });

  it('keeps each day once, oldest first', () => {
    expect(distinctSorted(['2026-08-02', '2026-08-01', '2026-08-02'])).toEqual(['2026-08-01', '2026-08-02']);
  });
});
