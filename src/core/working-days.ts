import { addDays, businessDateAt, type BusinessDate } from './business-date';

/**
 * The calendar of working days, as pure functions of the days nobody works and the time zone of the organization (`FR-3.8`,
 * `OI-14a`, `US-01-04` AC-10). Saturday and Sunday never count, nor does any date of `nonWorkingDates`. No Nest, no database:
 * the caller reads the days from the operating parameters and passes them in, so a deadline is the same wherever it is computed.
 */
export type NonWorkingDates = ReadonlySet<BusinessDate>;

/** Day of the week of a business date, 0 = Sunday ... 6 = Saturday. */
function weekdayOf(date: BusinessDate): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function isWeekend(date: BusinessDate): boolean {
  const weekday = weekdayOf(date);

  return weekday === 0 || weekday === 6;
}

export function isWorkingDay(date: BusinessDate, nonWorkingDates: NonWorkingDates): boolean {
  return !isWeekend(date) && !nonWorkingDates.has(date);
}

/**
 * The working day `count` working days after `date` (before it when `count` is negative). `date` itself is never counted, whether
 * or not it is a working day, so a request made on a Saturday with two days to wait is due on the Tuesday after.
 */
export function addWorkingDays(date: BusinessDate, count: number, nonWorkingDates: NonWorkingDates): BusinessDate {
  const step = count < 0 ? -1 : 1;
  let remaining = Math.abs(count);
  let current = date;
  while (remaining > 0) {
    current = addDays(current, step);
    if (isWorkingDay(current, nonWorkingDates)) remaining -= 1;
  }

  return current;
}

/**
 * The `n`th working day counting `start` as day 1 (`QĐ-110c`, `QĐ-110p`): the first day is `start` itself when it is a working
 * day, and the next working day when it is not, so "day 5 of a grace that begins on a Saturday" is the Friday after. Unlike
 * `addWorkingDays`, which never counts the day it starts from. `n` is at least 1.
 */
export function nthWorkingDayFrom(start: BusinessDate, n: number, nonWorkingDates: NonWorkingDates): BusinessDate {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`There is no working day number ${n}: counting starts at 1.`);
  let first = start;
  while (!isWorkingDay(first, nonWorkingDates)) first = addDays(first, 1);

  return addWorkingDays(first, n - 1, nonWorkingDates);
}

export function subtractWorkingDays(date: BusinessDate, count: number, nonWorkingDates: NonWorkingDates): BusinessDate {
  return addWorkingDays(date, -count, nonWorkingDates);
}

/**
 * How many working days lie in the interval after `from` up to and including `to`; zero when `to` is not after `from`. Counting
 * from the day after `from` makes the age of something made on `from` the number of working days it has lived through.
 */
export function workingDaysBetween(from: BusinessDate, to: BusinessDate, nonWorkingDates: NonWorkingDates): number {
  if (to <= from) return 0;
  let days = 0;
  for (let current = addDays(from, 1); current <= to; current = addDays(current, 1)) {
    if (isWorkingDay(current, nonWorkingDates)) days += 1;
  }

  return days;
}

/** The local date and the milliseconds since local midnight of an instant in a time zone. */
export interface WallClock {
  date: BusinessDate;
  msOfDay: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }

  return formatter;
}

/** The wall clock of `instant` in `timeZone`, to the second, with the milliseconds of the instant kept. */
export function wallClockAt(instant: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const pick = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const millis = ((instant.getTime() % 1000) + 1000) % 1000;

  return {
    date: businessDateAt(instant, timeZone),
    msOfDay: ((pick('hour') * 60 + pick('minute')) * 60 + pick('second')) * 1000 + millis,
  };
}

/** What a time zone adds to UTC at `instantMs`, in milliseconds. */
function offsetAt(instantMs: number, timeZone: string): number {
  const clock = wallClockAt(new Date(instantMs), timeZone);

  return Date.parse(`${clock.date}T00:00:00.000Z`) + clock.msOfDay - instantMs;
}

/**
 * The instant a wall clock shows in a time zone. A clock the zone skips (the hour that does not exist when the clocks go
 * forward) reads as the instant after the gap; a clock the zone shows twice reads as the first time.
 */
export function instantAtWallClock(clock: WallClock, timeZone: string): Date {
  const naive = Date.parse(`${clock.date}T00:00:00.000Z`) + clock.msOfDay;
  const first = naive - offsetAt(naive, timeZone);
  const settled = naive - offsetAt(first, timeZone);
  // Near a change of the clocks the two guesses differ; the earlier instant is the first reading of a repeated hour.
  const second = naive - offsetAt(settled, timeZone);

  return new Date(Math.min(settled, second));
}

/**
 * When a step made at `createdAt` with `slaWorkingDays` days to wait is due: the same wall clock, in the time zone of the
 * organization, on the working day that many working days after the day it was made. The clock is the whole day, not a
 * window of hours inside it.
 */
export function slaDueAt(
  createdAt: Date,
  slaWorkingDays: number,
  nonWorkingDates: NonWorkingDates,
  timeZone: string,
): Date {
  const created = wallClockAt(createdAt, timeZone);
  const dueDate = addWorkingDays(created.date, slaWorkingDays, nonWorkingDates);

  return instantAtWallClock({ date: dueDate, msOfDay: created.msOfDay }, timeZone);
}
