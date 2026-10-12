/** A calendar date with no time or zone, as `YYYY-MM-DD`. Business dates follow the organization time zone. */
export type BusinessDate = string;

const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export function isBusinessDate(value: string): value is BusinessDate {
  if (!SHAPE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    // Intl accepts offsets like "+07:00"; the organization zone must be an IANA name.
    return zone.includes('/') || zone === 'UTC';
  } catch {
    return false;
  }
}

/** The calendar date at `instant` in `timeZone`. */
export function businessDateAt(instant: Date, timeZone: string): BusinessDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';

  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** Midnight UTC of a business date: the value Prisma reads and writes for a `date` column. */
export function toDateColumn(date: BusinessDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDateColumn(value: Date): BusinessDate {
  return value.toISOString().slice(0, 10);
}
