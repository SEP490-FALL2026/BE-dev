import {
  expenseYearOf,
  firstOfMonth,
  labelOfPurchaseInvoice,
  monthsBetween,
  type PurchaseInvoiceLabelInput,
} from './purchase-invoice-labels.policy';

/** The `K1` right of the numbers test T-PI: granted 10/03/2027 for 6 months, the month of the grant is the first period. */
const SIX_MONTHS: Omit<PurchaseInvoiceLabelInput, 'serviceMonth' | 'hasEarlierInvoice'> = {
  link: 'REQUEST',
  continuation: false,
  startMonth: '2027-03-01',
  termMonths: 6,
};

describe('purchase invoice label and period (QĐ-111w, R-50; T-PI)', () => {
  describe('a request of a right that has an end', () => {
    it('calls the first invoice "Mua mới" and counts its period: month 03 of 6 is 1/6', () => {
      expect(labelOfPurchaseInvoice({ ...SIX_MONTHS, serviceMonth: '2027-03-01', hasEarlierInvoice: false })).toEqual({
        label: 'NEW_PURCHASE',
        periodIndex: 1,
        periodCount: 6,
        outsideTerm: false,
      });
    });

    it('calls a later invoice "Kỳ k/N": month 05 is 3/6', () => {
      expect(labelOfPurchaseInvoice({ ...SIX_MONTHS, serviceMonth: '2027-05-01', hasEarlierInvoice: true })).toEqual({
        label: 'PERIOD',
        periodIndex: 3,
        periodCount: 6,
        outsideTerm: false,
      });
    });

    it('keeps the last month of the term inside it and flags the month after it: 08 is 6/6, 09 is outside the term', () => {
      expect(
        labelOfPurchaseInvoice({ ...SIX_MONTHS, serviceMonth: '2027-08-01', hasEarlierInvoice: true }),
      ).toMatchObject({ periodIndex: 6, periodCount: 6, outsideTerm: false });
      expect(
        labelOfPurchaseInvoice({ ...SIX_MONTHS, serviceMonth: '2027-09-01', hasEarlierInvoice: true }),
      ).toMatchObject({ label: 'PERIOD', periodIndex: 7, periodCount: 6, outsideTerm: true });
    });

    it('is still the first invoice when it is for a later month: the label follows the invoices, the period follows the month', () => {
      expect(labelOfPurchaseInvoice({ ...SIX_MONTHS, serviceMonth: '2027-04-01', hasEarlierInvoice: false })).toEqual({
        label: 'NEW_PURCHASE',
        periodIndex: 2,
        periodCount: 6,
        outsideTerm: false,
      });
    });

    it('flags a month before the right began and gives it no period', () => {
      expect(labelOfPurchaseInvoice({ ...SIX_MONTHS, serviceMonth: '2027-02-01', hasEarlierInvoice: false })).toEqual({
        label: 'NEW_PURCHASE',
        periodIndex: null,
        periodCount: 6,
        outsideTerm: true,
      });
    });

    it('counts across the turn of the year: a right from 11/2026 is in period 3 in 01/2027', () => {
      expect(
        labelOfPurchaseInvoice({
          ...SIX_MONTHS,
          startMonth: '2026-11-01',
          serviceMonth: '2027-01-01',
          hasEarlierInvoice: true,
        }),
      ).toMatchObject({ periodIndex: 3, periodCount: 6, outsideTerm: false });
    });
  });

  describe('a request of a right with no end ("Dùng lâu dài", R-50)', () => {
    it('calls a later invoice "Kỳ k" with no total: month 2 is "Kỳ 2" and never outside the term', () => {
      expect(
        labelOfPurchaseInvoice({
          ...SIX_MONTHS,
          termMonths: null,
          serviceMonth: '2027-04-01',
          hasEarlierInvoice: true,
        }),
      ).toEqual({ label: 'PERIOD', periodIndex: 2, periodCount: null, outsideTerm: false });
      expect(
        labelOfPurchaseInvoice({
          ...SIX_MONTHS,
          termMonths: null,
          serviceMonth: '2031-03-01',
          hasEarlierInvoice: true,
        }),
      ).toMatchObject({ periodIndex: 49, periodCount: null, outsideTerm: false });
    });
  });

  describe('a renewal', () => {
    it('is "Gia hạn" for an invoice of a subscription, with no period', () => {
      expect(
        labelOfPurchaseInvoice({
          link: 'SUBSCRIPTION',
          continuation: false,
          startMonth: null,
          termMonths: null,
          serviceMonth: '2027-03-01',
          hasEarlierInvoice: true,
        }),
      ).toEqual({ label: 'RENEWAL', periodIndex: null, periodCount: null, outsideTerm: false });
    });

    it('is "Gia hạn" for an invoice of a request that goes on using (QĐ-111l), first or not', () => {
      for (const hasEarlierInvoice of [false, true]) {
        expect(
          labelOfPurchaseInvoice({ ...SIX_MONTHS, continuation: true, serviceMonth: '2027-09-01', hasEarlierInvoice }),
        ).toEqual({ label: 'RENEWAL', periodIndex: null, periodCount: null, outsideTerm: false });
      }
    });
  });

  describe('the month an invoice pays for', () => {
    it('is the first day of the month of any day given', () => {
      expect(firstOfMonth('2026-12-17')).toBe('2026-12-01');
      expect(firstOfMonth('2027-01-01')).toBe('2027-01-01');
    });

    it('belongs to the year of the service month, whatever day the invoice is dated: 02/01/2027 for 12/2026 is spent in 2026', () => {
      expect(expenseYearOf('2026-12-01')).toBe(2026);
      expect(expenseYearOf('2027-01-01')).toBe(2027);
    });

    it('counts months between two first days, across years', () => {
      expect(monthsBetween('2026-11-01', '2027-02-01')).toBe(3);
      expect(monthsBetween('2027-02-01', '2026-11-01')).toBe(-3);
      expect(monthsBetween('2027-03-01', '2027-03-01')).toBe(0);
    });
  });
});
