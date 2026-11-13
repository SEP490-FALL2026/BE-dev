import { addDays } from '../../../core/business-date';
import { graceEndsOn, graceReminderOn, graceWindowEnd } from './transfer-grace.policy';

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
