import {
  closureDue,
  legacyAnnouncementDue,
  reminderDue,
  revocationDue,
  rightOutcome,
  rightsToTakeBack,
  supersedable,
  type SweptTransfer,
} from './transfer-sweep.policy';

// SPEC T-MF3: effective Monday 16/11/2026, a grace of five working days ends Friday 20/11 and the person is told again on Wednesday 18/11.
const effective: SweptTransfer = {
  status: 'EFFECTIVE',
  closed: false,
  graceEndsOn: '2026-11-20',
  graceReminderOn: '2026-11-18',
  reminded: false,
  hasSnapshot: true,
};

describe('reminderDue (QĐ-110p: the person is told again two working days before the last day)', () => {
  it.each([
    ['the day before the reminder', '2026-11-17', false],
    ['the day of the reminder', '2026-11-18', true],
    ['after the reminder, a pass that missed the day', '2026-11-19', true],
    ['the last day of the grace', '2026-11-20', true],
    ['the day after the last day: the revocation tells instead', '2026-11-21', false],
  ])('%s (%s) ⟹ %s', (_name, today, expected) => {
    expect(reminderDue(effective, today)).toBe(expected);
  });

  it('is owed once: a transfer already reminded is not reminded again', () => {
    expect(reminderDue({ ...effective, reminded: true }, '2026-11-18')).toBe(false);
  });

  it.each([
    ['closed', { closed: true }],
    ['cancelled', { status: 'CANCELLED' as const }],
    ['waiting', { status: 'PENDING' as const }],
    ['with no grace (a transfer that never opened one)', { graceEndsOn: null, graceReminderOn: null }],
  ])('is not owed on a transfer that is %s', (_name, change) => {
    expect(reminderDue({ ...effective, ...change }, '2026-11-18')).toBe(false);
  });
});

describe('revocationDue (QĐ-110p: the day after the last day of the grace the rights are taken back)', () => {
  it.each([
    ['the last day is still the grace', '2026-11-20', false],
    ['the day after the last day', '2026-11-21', true],
    ['a pass that was down for days', '2026-11-30', true],
    ['before the last day', '2026-11-19', false],
  ])('%s (%s) ⟹ %s', (_name, today, expected) => {
    expect(revocationDue(effective, today)).toBe(expected);
  });

  it.each([
    ['closed', { closed: true }],
    ['cancelled', { status: 'CANCELLED' as const }],
    ['waiting', { status: 'PENDING' as const }],
    ['with no grace', { graceEndsOn: null, graceReminderOn: null }],
  ])('is not due on a transfer that is %s', (_name, change) => {
    expect(revocationDue({ ...effective, ...change }, '2026-11-30')).toBe(false);
  });
});

describe('legacyAnnouncementDue (m-17: a transfer that took effect before the grace existed was never told on day 1)', () => {
  const legacy: SweptTransfer = { ...effective, hasSnapshot: false };

  it('is owed while the grace lasts on a transfer with no snapshot of the rights', () => {
    expect(legacyAnnouncementDue(legacy, '2026-11-16')).toBe(true);
    expect(legacyAnnouncementDue(legacy, '2026-11-20')).toBe(true);
  });

  it('is not owed once the grace is over: the revocation tells the person then', () => {
    expect(legacyAnnouncementDue(legacy, '2026-11-21')).toBe(false);
  });

  it('is not owed on a transfer the settlement opened (it has its snapshot and told everyone on day 1)', () => {
    expect(legacyAnnouncementDue(effective, '2026-11-17')).toBe(false);
  });

  it.each([
    ['closed', { closed: true }],
    ['cancelled', { status: 'CANCELLED' as const }],
    ['with no grace', { graceEndsOn: null, graceReminderOn: null }],
  ])('is not owed on a transfer that is %s', (_name, change) => {
    expect(legacyAnnouncementDue({ ...legacy, ...change }, '2026-11-17')).toBe(false);
  });
});

describe('rightsToTakeBack (QĐ-110p, C.1: the personal rights held from before the day, still in force, that a task can take away)', () => {
  const seat = (
    id: string,
    effectiveFrom: string,
    extra: { validUntil?: string | null; provisioningType?: string } = {},
  ) => ({ id, effectiveFrom, validUntil: extra.validUntil ?? null, provisioningType: extra.provisioningType ?? 'K2' });

  it('keeps the rights begun on the day of the transfer or before, and not the ones begun after (they are the new department’s)', () => {
    const seats = [seat('old', '2026-09-01'), seat('same-day', '2026-11-16'), seat('later', '2026-11-17')];

    expect(rightsToTakeBack(seats, '2026-11-16').map((s) => s.id)).toEqual(['old', 'same-day']);
  });

  it('leaves out a right that already has an end (a K1 right whose access runs to the end of the paid period is revoked already)', () => {
    const seats = [seat('open', '2026-09-01'), seat('ending', '2026-09-01', { validUntil: '2026-12-31' })];

    expect(rightsToTakeBack(seats, '2026-11-16').map((s) => s.id)).toEqual(['open']);
  });

  it.each(['K1', 'K2', 'K4', 'K5'])('keeps a %s right: it has a revocation', (type) => {
    expect(rightsToTakeBack([seat('a', '2026-09-01', { provisioningType: type })], '2026-11-16')).toHaveLength(1);
  });

  it('leaves out a K3 right: no task can be made for it, so it must not keep the transfer open for ever', () => {
    expect(rightsToTakeBack([seat('a', '2026-09-01', { provisioningType: 'K3' })], '2026-11-16')).toEqual([]);
  });

  it('is empty for a person who holds nothing', () => {
    expect(rightsToTakeBack([], '2026-11-16')).toEqual([]);
  });
});

describe('closureDue (QĐ-110r: the system closes the transfer when no right of the old department is left to take back)', () => {
  it.each([
    ['the grace is not over: even with no right left, the person keeps the grace', '2026-11-20', 0, false],
    [
      'the day after the last day with no right left (nothing to revoke, or every task completed)',
      '2026-11-21',
      0,
      true,
    ],
    ['a later day with no right left', '2026-12-01', 0, true],
    ['one right still held, a task waits', '2026-11-21', 1, false],
    ['three rights still held', '2026-12-01', 3, false],
  ])('%s (%s, %s open) ⟹ %s', (_name, today, open, expected) => {
    expect(closureDue(effective, open, today)).toBe(expected);
  });

  it.each([
    ['closed already', { closed: true }],
    ['cancelled', { status: 'CANCELLED' as const }],
    ['waiting', { status: 'PENDING' as const }],
    ['with no grace', { graceEndsOn: null, graceReminderOn: null }],
  ])('never closes a transfer that is %s', (_name, change) => {
    expect(closureDue({ ...effective, ...change }, 0, '2026-12-01')).toBe(false);
  });
});

describe('supersedable (QĐ-110r: a departure recorded in the grace takes the old rights over)', () => {
  it.each([
    ['the first day of the grace', '2026-11-16', true],
    ['the last day of the grace', '2026-11-20', true],
    [
      'the day after: the system has opened the revocation, the departure adds its reason to the tasks',
      '2026-11-21',
      false,
    ],
  ])('%s (%s) ⟹ %s', (_name, today, expected) => {
    expect(supersedable(effective, today)).toBe(expected);
  });

  it.each([
    ['closed', { closed: true }],
    ['cancelled', { status: 'CANCELLED' as const }],
    ['waiting', { status: 'PENDING' as const }],
    ['with no grace', { graceEndsOn: null, graceReminderOn: null }],
  ])('is not owed on a transfer that is %s', (_name, change) => {
    expect(supersedable({ ...effective, ...change }, '2026-11-17')).toBe(false);
  });
});

describe('rightOutcome (QĐ-110r: what became of each right of the picture, written when the transfer closes)', () => {
  it.each([
    [
      'asked for again on the same subscription and granted (R-49)',
      { held: false, revoked: false, regranted: true },
      'REGRANTED',
    ],
    [
      'a departure takes the right over while the grace lasts',
      { held: true, revoked: false, regranted: false },
      'TAKEN_OVER',
    ],
    ['taken back by the revocation of this transfer', { held: false, revoked: true, regranted: false }, 'REVOKED'],
    [
      'ended some other way (returned, expired, revoked by a departure)',
      { held: false, revoked: false, regranted: false },
      'ENDED',
    ],
    [
      'regranted wins over a revocation that was opened for it',
      { held: false, revoked: true, regranted: true },
      'REGRANTED',
    ],
  ])('%s ⟹ %s', (_name, facts, expected) => {
    expect(rightOutcome(facts)).toBe(expected);
  });
});
