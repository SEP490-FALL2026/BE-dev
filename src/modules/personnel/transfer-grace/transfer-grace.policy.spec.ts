import { addDays } from '../../../core/business-date';
import {
  graceEndsOn,
  graceOf,
  graceReminderOn,
  graceStartsOn,
  graceWindowEnd,
  heldOnOrBefore,
  isOldRightOf,
  transferPhase,
} from './transfer-grace.policy';

const NONE: ReadonlySet<string> = new Set();

describe('the day the old rights end after a transfer (QĐ-110p, T-MF3)', () => {
  it.each([
    ['takes effect on Monday 16/11: day 1 is 16/11, day 5 is Friday 20/11', '2026-11-16', 5, NONE, '2026-11-20'],
    [
      'takes effect on Friday 13/11: the weekend does not count, day 5 is Thursday 19/11',
      '2026-11-13',
      5,
      NONE,
      '2026-11-19',
    ],
    [
      'takes effect on Saturday 14/11: day 1 is Monday 16/11, day 5 is Friday 20/11',
      '2026-11-14',
      5,
      NONE,
      '2026-11-20',
    ],
    ['a grace of one day ends on the day it begins', '2026-11-16', 1, NONE, '2026-11-16'],
    ['a day off inside the grace is not counted', '2026-11-16', 5, new Set(['2026-11-18']), '2026-11-23'],
    ['a day off on the day it takes effect moves day 1', '2026-11-16', 5, new Set(['2026-11-16']), '2026-11-23'],
  ])('%s', (_name, effectiveOn, days, nonWorking, expected) => {
    expect(graceEndsOn(effectiveOn, days, nonWorking)).toBe(expected);
  });

  it('asks for a window of days off that holds the working days of the grace', () => {
    expect(graceWindowEnd('2026-11-16')).toBe(addDays('2026-11-16', 90));
  });
});

describe('the day the person is told once more before the grace ends (QĐ-110p, T-MF3)', () => {
  it.each([
    ['two working days before Friday 20/11 is Wednesday 18/11', '2026-11-16', '2026-11-20', 2, NONE, '2026-11-18'],
    [
      'a weekend between is not counted: two working days before Tuesday 17/11 is Friday 13/11',
      '2026-11-09',
      '2026-11-17',
      2,
      NONE,
      '2026-11-13',
    ],
    ['a day off is not counted', '2026-11-16', '2026-11-20', 2, new Set(['2026-11-19']), '2026-11-17'],
    [
      'never before the day the transfer takes effect: a short grace is told on its first day',
      '2026-11-16',
      '2026-11-17',
      2,
      NONE,
      '2026-11-16',
    ],
    [
      'never before the first working day of a grace that begins on a Saturday',
      '2026-11-14',
      '2026-11-16',
      2,
      NONE,
      '2026-11-16',
    ],
  ])('%s', (_name, effectiveOn, endsOn, days, nonWorking, expected) => {
    expect(graceReminderOn(effectiveOn, endsOn, days, nonWorking)).toBe(expected);
  });
});

describe('the day the grace begins (QĐ-110p, m-17)', () => {
  it.each([
    [
      'the day the transfer takes effect is day 1 when the system sees it that day',
      '2026-11-16',
      '2026-11-16',
      '2026-11-16',
    ],
    ['and when it is seen before the day', '2026-11-16', '2026-11-13', '2026-11-16'],
    [
      'a transfer that took effect before the release begins its grace on the day of the release',
      '2026-11-02',
      '2026-11-16',
      '2026-11-16',
    ],
    [
      'a transfer the system sees late begins its grace the day it sees it, so the person is never given less than the grace',
      '2026-11-16',
      '2026-11-18',
      '2026-11-18',
    ],
  ])('%s', (_name, effectiveOn, notedOn, expected) => {
    expect(graceStartsOn(effectiveOn, notedOn)).toBe(expected);
  });
});

describe('the whole grace of a transfer (QĐ-110p, T-MF3, m-17)', () => {
  const grace = (effectiveOn: string, notedOn: string, off: ReadonlySet<string> = NONE) =>
    graceOf({ effectiveOn, notedOn, workingDays: 5, reminderWorkingDays: 2, nonWorkingDates: off });

  it('T-MF3: takes effect on Monday 16/11 ⟹ ends on Friday 20/11, reminder on Wednesday 18/11', () => {
    expect(grace('2026-11-16', '2026-11-16')).toEqual({
      startsOn: '2026-11-16',
      endsOn: '2026-11-20',
      reminderOn: '2026-11-18',
    });
  });

  it('m-17: a transfer that took effect long before a release of 16/11 has the grace of 16/11 to 20/11, reminder on 18/11', () => {
    expect(grace('2026-10-05', '2026-11-16')).toEqual({
      startsOn: '2026-11-16',
      endsOn: '2026-11-20',
      reminderOn: '2026-11-18',
    });
  });

  it('a release on a Saturday begins the grace on the Monday after: the weekend is not counted', () => {
    expect(grace('2026-10-05', '2026-11-14')).toEqual({
      startsOn: '2026-11-14',
      endsOn: '2026-11-20',
      reminderOn: '2026-11-18',
    });
  });

  it('a day off inside the grace moves its end (Thursday 19/11 off: day 5 is Monday 23/11) and the reminder counts two working days back from it (Friday 20/11, Wednesday 18/11)', () => {
    expect(grace('2026-11-16', '2026-11-16', new Set(['2026-11-19']))).toEqual({
      startsOn: '2026-11-16',
      endsOn: '2026-11-23',
      reminderOn: '2026-11-18',
    });
  });
});

describe('the rights that are old rights of a transfer (QĐ-110p: held when the day comes)', () => {
  const seat = (assignmentId: string, effectiveFrom: string) => ({ assignmentId, effectiveFrom });

  it('keeps a right that began before the day or on it, drops one that begins after (granted later, in the new department)', () => {
    const seats = [
      seat('before', '2026-11-13'),
      seat('long-ago', '2026-01-05'),
      seat('same-day', '2026-11-16'),
      seat('after', '2026-11-18'),
    ];

    expect(heldOnOrBefore(seats, '2026-11-16').map((item) => item.assignmentId)).toEqual([
      'before',
      'long-ago',
      'same-day',
    ]);
  });

  it('keeps nothing of nobody', () => {
    expect(heldOnOrBefore([], '2026-11-16')).toEqual([]);
  });
});

describe('where a transfer stands (P7, QĐ-110p)', () => {
  const transfer = (over: Partial<Parameters<typeof transferPhase>[0]> = {}) => ({
    status: 'EFFECTIVE' as const,
    closed: false,
    graceEndsOn: '2026-11-20',
    ...over,
  });

  it.each([
    [
      'a transfer waiting for its day is pending',
      { status: 'PENDING' as const, graceEndsOn: null },
      '2026-11-13',
      'PENDING',
    ],
    [
      'a cancelled transfer is cancelled',
      { status: 'CANCELLED' as const, graceEndsOn: null },
      '2026-11-13',
      'CANCELLED',
    ],
    ['the day it took effect the person is in grace', {}, '2026-11-16', 'IN_GRACE'],
    ['the last day of the grace is still the grace: the revocation opens the day after', {}, '2026-11-20', 'IN_GRACE'],
    ['the day after the last day the rights are being taken back', {}, '2026-11-21', 'REVOKING'],
    ['a closed transfer is closed, whatever the day', { closed: true }, '2026-11-25', 'CLOSED'],
    [
      'a transfer closed because a departure took the rights over is superseded (QĐ-110r)',
      { closed: true, supersededByCaseId: '0194b7a8-0000-7000-8000-000000000001' },
      '2026-11-17',
      'SUPERSEDED',
    ],
    [
      'a closed transfer no departure took over is closed even with a null case',
      { closed: true, supersededByCaseId: null },
      '2026-11-25',
      'CLOSED',
    ],
    ['a transfer that took effect and has no grace yet is in grace', { graceEndsOn: null }, '2026-11-16', 'IN_GRACE'],
  ] as const)('%s', (_name, over, today, expected) => {
    expect(transferPhase(transfer(over), today)).toBe(expected);
  });
});

describe('whether a right held is a right of the old department (QĐ-110q, P10)', () => {
  const picture = ['seat-1', 'seat-2'];

  it('is one the picture of the day the transfer took effect names, whatever day it began', () => {
    expect(
      isOldRightOf(
        { effectiveOn: '2026-11-16', pictureIds: picture },
        { assignmentId: 'seat-2', effectiveFrom: '2026-09-01' },
      ),
    ).toBe(true);
  });

  it('is not one the picture does not name: a right granted afterwards is the new department’s, even if it began before', () => {
    expect(
      isOldRightOf(
        { effectiveOn: '2026-11-16', pictureIds: picture },
        { assignmentId: 'seat-9', effectiveFrom: '2026-09-01' },
      ),
    ).toBe(false);
  });

  it('with no picture (a transfer from before the grace) is one that began on the day it took effect or before', () => {
    const transfer = { effectiveOn: '2026-11-16', pictureIds: null };

    expect(isOldRightOf(transfer, { assignmentId: 'a', effectiveFrom: '2026-11-16' })).toBe(true);
    expect(isOldRightOf(transfer, { assignmentId: 'a', effectiveFrom: '2026-10-01' })).toBe(true);
    expect(isOldRightOf(transfer, { assignmentId: 'a', effectiveFrom: '2026-11-17' })).toBe(false);
  });
});
