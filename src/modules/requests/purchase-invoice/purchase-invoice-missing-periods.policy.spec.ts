import {
  coveredMonthsOf,
  invoiceDueDate,
  lacksInvoice,
  lastDayOfSeats,
  requestPaymentPeriods,
  subscriptionPaymentPeriods,
} from './purchase-invoice-missing-periods.policy';

const none: ReadonlySet<string> = new Set();

describe('the period that has no invoice (QĐ-111x, R-30, C-2)', () => {
  describe('the day an invoice is due: the fifth working day, the payment day being the first when it is one (QĐ-104k(2))', () => {
    it('is Monday 16/11/2026 for a payment on Tuesday 10/11/2026: 10, 11, 12, 13 and 16', () => {
      expect(invoiceDueDate('2026-11-10', none)).toBe('2026-11-16');
    });

    it('does not count a day nobody works: a holiday on 12/11 moves it to 17/11', () => {
      expect(invoiceDueDate('2026-11-10', new Set(['2026-11-12']))).toBe('2026-11-17');
    });

    it('counts from the next working day when the payment falls on a Saturday: Monday 16/11 is the first, Friday 20/11 the fifth', () => {
      expect(invoiceDueDate('2026-11-14', none)).toBe('2026-11-20');
    });
  });

  describe('when the period carries the mark', () => {
    it('is not marked on the due day itself: a payment on Tuesday 10/11/2026 is still on time on Monday 16/11', () => {
      expect(lacksInvoice('2026-11-10', '2026-11-16', none)).toBe(false);
    });

    it('is marked from the day after the due day: 17/11/2026 (QĐ-104k(2); the SPEC of PI-2 said 18/11)', () => {
      expect(lacksInvoice('2026-11-10', '2026-11-17', none)).toBe(true);
    });

    it('is not marked before the payment day, nor on it', () => {
      expect(lacksInvoice('2026-11-10', '2026-11-09', none)).toBe(false);
      expect(lacksInvoice('2026-11-10', '2026-11-10', none)).toBe(false);
    });

    it('stays marked once the due day has passed, a weekend included', () => {
      // Payment Monday 16/11: due Friday 20/11; the deadline is over on Saturday 21/11.
      expect(lacksInvoice('2026-11-16', '2026-11-20', none)).toBe(false);
      expect(lacksInvoice('2026-11-16', '2026-11-21', none)).toBe(true);
    });

    it('waits for the working days of a holiday: the same payment is on time on 17/11 and marked on 18/11 only when 12/11 is a holiday', () => {
      const holiday = new Set(['2026-11-12']);

      expect(lacksInvoice('2026-11-10', '2026-11-17', holiday)).toBe(false);
      expect(lacksInvoice('2026-11-10', '2026-11-18', holiday)).toBe(true);
    });
  });

  describe('the payment days of the right a request granted', () => {
    it('are the day of the grant each month for the months of use: 10/03/2027 for 6 months pays on the 10th from March to August', () => {
      const periods = requestPaymentPeriods({ grantDay: '2027-03-10', termMonths: 6, lastDay: null });

      expect(periods.map((period) => period.paymentDate)).toEqual([
        '2027-03-10',
        '2027-04-10',
        '2027-05-10',
        '2027-06-10',
        '2027-07-10',
        '2027-08-10',
      ]);
      expect(periods.map((period) => period.serviceMonth)).toEqual([
        '2027-03-01',
        '2027-04-01',
        '2027-05-01',
        '2027-06-01',
        '2027-07-01',
        '2027-08-01',
      ]);
      expect(periods.map((period) => period.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(periods.every((period) => period.months === 1)).toBe(true);
    });

    it('keeps the day of the grant in a short month without moving the next ones: 31/01 pays on 28/02 and 31/03', () => {
      const periods = requestPaymentPeriods({ grantDay: '2027-01-31', termMonths: 3, lastDay: null });

      expect(periods.map((period) => period.paymentDate)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    });

    it('stop where the right stops: a contract that ends on 09/05 leaves two payments, since a month that has begun is paid whole', () => {
      const periods = requestPaymentPeriods({ grantDay: '2027-03-10', termMonths: 6, lastDay: '2027-05-09' });

      expect(periods.map((period) => period.paymentDate)).toEqual(['2027-03-10', '2027-04-10']);
    });

    it('keep the payment of the day the right ends on', () => {
      const periods = requestPaymentPeriods({ grantDay: '2027-03-10', termMonths: 6, lastDay: '2027-05-10' });

      expect(periods.map((period) => period.paymentDate)).toEqual(['2027-03-10', '2027-04-10', '2027-05-10']);
    });
  });

  describe('the payment days of a subscription', () => {
    const base = {
      billingCycle: 'MONTHLY' as const,
      startDate: '2026-01-05',
      endDate: null,
      renewalDate: '2026-12-05',
      autoRenew: true,
      notBefore: '2026-01-05',
      until: '2026-11-20',
    };

    it('follow the renewal day by the cycle, from the day the system knew the subscription: monthly from 01/09 pays on 05/09, 05/10 and 05/11', () => {
      const periods = subscriptionPaymentPeriods({ ...base, notBefore: '2026-09-01' });

      expect(periods.map((period) => period.paymentDate)).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);
      expect(periods.map((period) => period.serviceMonth)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
      expect(periods.every((period) => period.sequence === null)).toBe(true);
    });

    it('never begin before the subscription does', () => {
      const periods = subscriptionPaymentPeriods({ ...base, startDate: '2026-10-20', notBefore: '2026-01-01' });

      expect(periods.map((period) => period.paymentDate)).toEqual(['2026-11-05']);
    });

    it('are one a year for a plan paid by the year, and cover twelve months', () => {
      const periods = subscriptionPaymentPeriods({
        ...base,
        billingCycle: 'ANNUAL',
        startDate: '2026-03-15',
        renewalDate: '2027-03-15',
        notBefore: '2026-03-15',
        until: '2026-11-15',
      });

      expect(periods.map((period) => period.paymentDate)).toEqual(['2026-03-15']);
      expect(periods[0].months).toBe(12);
    });

    it('do not reach past the end day of a plan that does not renew itself, nor include it', () => {
      const periods = subscriptionPaymentPeriods({
        ...base,
        endDate: '2026-04-05',
        autoRenew: false,
        until: '2026-12-31',
      });

      expect(periods.map((period) => period.paymentDate)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
    });

    it('go on past the end day of a plan that renews itself', () => {
      const periods = subscriptionPaymentPeriods({ ...base, endDate: '2026-04-05', until: '2026-06-30' });

      expect(periods.map((period) => period.paymentDate)).toEqual([
        '2026-01-05',
        '2026-02-05',
        '2026-03-05',
        '2026-04-05',
        '2026-05-05',
        '2026-06-05',
      ]);
    });

    it('never name a day after today', () => {
      const periods = subscriptionPaymentPeriods({ ...base, until: '2026-03-04' });

      expect(periods.map((period) => period.paymentDate)).toEqual(['2026-01-05', '2026-02-05']);
    });

    it('is the end day when the renewal day is not set', () => {
      const periods = subscriptionPaymentPeriods({
        ...base,
        renewalDate: null,
        endDate: '2026-12-05',
        autoRenew: false,
        until: '2026-03-31',
      });

      expect(periods.map((period) => period.paymentDate)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
    });
  });

  describe('the months a payment pays for', () => {
    it('is the month of the payment for a payment by the month', () => {
      const [period] = requestPaymentPeriods({ grantDay: '2026-11-10', termMonths: 1, lastDay: null });

      expect(coveredMonthsOf(period)).toEqual(['2026-11']);
    });

    it('is the months of the cycle for a payment by the quarter, across the year', () => {
      const [period] = subscriptionPaymentPeriods({
        billingCycle: 'QUARTERLY',
        startDate: '2026-11-15',
        endDate: null,
        renewalDate: '2027-02-15',
        autoRenew: true,
        notBefore: '2026-11-15',
        until: '2026-11-30',
      });

      expect(coveredMonthsOf(period)).toEqual(['2026-11', '2026-12', '2027-01']);
    });
  });

  describe('the last day a request pays for', () => {
    it('is the day a seat is expected to end, or the day before its period closes when that is earlier', () => {
      expect(lastDayOfSeats([{ expectedEndDate: '2027-05-09', validUntil: null }])).toBe('2027-05-09');
      expect(lastDayOfSeats([{ expectedEndDate: '2027-05-09', validUntil: '2027-04-21' }])).toBe('2027-04-20');
      expect(lastDayOfSeats([{ expectedEndDate: null, validUntil: '2027-04-21' }])).toBe('2027-04-20');
    });

    it('is the latest of the seats of a request for a group', () => {
      expect(
        lastDayOfSeats([
          { expectedEndDate: '2027-05-09', validUntil: null },
          { expectedEndDate: '2027-06-09', validUntil: null },
        ]),
      ).toBe('2027-06-09');
    });

    it('is nothing when a seat has no end: the months of use alone say where the payments stop', () => {
      expect(lastDayOfSeats([{ expectedEndDate: null, validUntil: null }])).toBeNull();
      expect(
        lastDayOfSeats([
          { expectedEndDate: '2027-05-09', validUntil: null },
          { expectedEndDate: null, validUntil: null },
        ]),
      ).toBeNull();
    });
  });
});
