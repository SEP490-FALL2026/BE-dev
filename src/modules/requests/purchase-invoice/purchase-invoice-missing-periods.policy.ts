import { addDays, type BusinessDate } from '../../../core/business-date';
import { addMonths } from '../../../core/fiscal-year';
import { nthWorkingDayFrom, type NonWorkingDates } from '../../../core/working-days';

/**
 * When a period of a right that is paid by the month or the year has no invoice (`QĐ-111x`, `R-30`, `C-2`), as pure rules. A period is paid on a
 * day (the day of the grant each month for the right a request granted; the renewal day by the cycle for a subscription) and its invoice is due
 * on the fifth working day, the payment day being the first when it is a working day (`QĐ-104k`(2)), the same time the IT Admin has to submit it
 * (`SBF-19`). Past that day with no invoice that was not returned, the
 * period carries the mark _kỳ này chưa có hóa đơn_. The five days are a rule, not a setting (`C-2`).
 */

/** The working days the IT Admin has after the payment day to submit the invoice of the period. */
export const INVOICE_DUE_WORKING_DAYS = 5;

/** The cycles a payment day repeats by; a plan paid in another way has no payment day to name. */
export type PaymentCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

const MONTHS_OF_CYCLE: Readonly<Record<PaymentCycle, number>> = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 };

/** One payment of a right and the months it pays for. */
export interface PaymentPeriod {
  paymentDate: BusinessDate;
  /** The first day of the month the payment begins to pay for: the month an invoice of the period names. */
  serviceMonth: BusinessDate;
  /** How many months the payment pays for: the months of the cycle. */
  months: number;
  /** The place of the payment in the months of use of a request (1 for the first); null for a subscription. */
  sequence: number | null;
}

/** The last day an invoice is on time: the fifth working day, the payment day being day 1 when it is a working day (`QĐ-104k`(2)). */
export function invoiceDueDate(paymentDate: BusinessDate, nonWorkingDates: NonWorkingDates): BusinessDate {
  return nthWorkingDayFrom(paymentDate, INVOICE_DUE_WORKING_DAYS, nonWorkingDates);
}

/** Whether the due day of the payment has passed on `today`: the mark begins the day after the due day, a weekend included. */
export function lacksInvoice(
  paymentDate: BusinessDate,
  today: BusinessDate,
  nonWorkingDates: NonWorkingDates,
): boolean {
  return today > invoiceDueDate(paymentDate, nonWorkingDates);
}

/**
 * The last day the seats of a request stand, the latest of them: each seat ends on the day it is expected to end or the day before its period
 * closes (`valid_until` is exclusive), whichever is earlier. Nothing when any seat has no end, so that the months of use alone say where the
 * payments stop.
 */
export function lastDayOfSeats(
  seats: readonly { expectedEndDate: BusinessDate | null; validUntil: BusinessDate | null }[],
): BusinessDate | null {
  let last: BusinessDate | null = null;
  for (const seat of seats) {
    const ends = [seat.expectedEndDate, seat.validUntil === null ? null : addDays(seat.validUntil, -1)].filter(
      (day): day is BusinessDate => day !== null,
    );
    if (ends.length === 0) return null;
    const end = ends.reduce((earlier, day) => (day < earlier ? day : earlier));
    if (last === null || end > last) last = end;
  }

  return last;
}

const firstOfMonth = (day: BusinessDate): BusinessDate => `${day.slice(0, 7)}-01`;

/**
 * The payments of the right a request granted: the day of the grant each month, for the months of use, from the first month on. A payment is
 * counted while the right still stands on its day (`lastDay`, the last day of the seat; null when none is known): a month that has begun is paid
 * whole (`R-39`), so a contract that ends the day before a payment day leaves that month out. The day of the month is the one of the grant in a
 * month long enough and the last day of a shorter one, and never moves the months after it.
 */
export function requestPaymentPeriods(input: {
  grantDay: BusinessDate;
  termMonths: number;
  lastDay: BusinessDate | null;
}): PaymentPeriod[] {
  const periods: PaymentPeriod[] = [];
  for (let at = 0; at < input.termMonths; at += 1) {
    const paymentDate = addMonths(input.grantDay, at);
    if (input.lastDay !== null && paymentDate > input.lastDay) break;
    periods.push({ paymentDate, serviceMonth: firstOfMonth(paymentDate), months: 1, sequence: at + 1 });
  }

  return periods;
}

/**
 * The payments of a subscription that fall from `notBefore` (the day the system came to know it, so a subscription entered while it runs does not
 * answer for the months before) to `until` (today): the renewal day (else the end day, else the start) repeated by the cycle, none before the
 * subscription began. A plan that does not renew itself and has an end day is not paid on it nor after it; one that renews itself goes on.
 */
export function subscriptionPaymentPeriods(input: {
  billingCycle: PaymentCycle;
  startDate: BusinessDate;
  endDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  autoRenew: boolean;
  notBefore: BusinessDate;
  until: BusinessDate;
}): PaymentPeriod[] {
  const months = MONTHS_OF_CYCLE[input.billingCycle];
  const anchor = input.renewalDate ?? input.endDate ?? input.startDate;
  const from = input.notBefore > input.startDate ? input.notBefore : input.startDate;
  const stopsAt = !input.autoRenew ? input.endDate : null;
  let at = 0;
  while (addMonths(anchor, (at - 1) * months) >= from) at -= 1;
  while (addMonths(anchor, at * months) < from) at += 1;

  const periods: PaymentPeriod[] = [];
  for (; ; at += 1) {
    const paymentDate = addMonths(anchor, at * months);
    if (paymentDate > input.until || (stopsAt !== null && paymentDate >= stopsAt)) break;
    periods.push({ paymentDate, serviceMonth: firstOfMonth(paymentDate), months, sequence: null });
  }

  return periods;
}

/** The months a payment pays for as `YYYY-MM`, the first being the month of the payment: what an invoice of the period may name. */
export function coveredMonthsOf(period: Pick<PaymentPeriod, 'serviceMonth' | 'months'>): string[] {
  const first = Number(period.serviceMonth.slice(0, 4)) * 12 + Number(period.serviceMonth.slice(5, 7)) - 1;

  return Array.from({ length: period.months }, (_, at) => {
    const index = first + at;

    return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
}
