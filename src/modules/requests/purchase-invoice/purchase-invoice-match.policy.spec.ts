import { matchPurchaseInvoice, mismatchesOfRow, pooledInvoiceCeilingMinor } from './purchase-invoice-match.policy';

/** T-PI: Figma, 10 seats at 15 USD each; the commitment is 3.750.000 đ and the card took 3.840.000 đ in VND (R-44). */
const FIGMA = {
  expectedQuantity: 10,
  expectedUnitPrice: { amountMinor: 1500n, currency: 'USD' },
};

describe('purchase invoice match with what was approved or bought (R-44; T-PI)', () => {
  it('matches 10 seats at 15 USD: the VND the card took is not compared, so no case is opened', () => {
    expect(
      matchPurchaseInvoice({ ...FIGMA, quantity: 10, unitPriceOriginal: { amountMinor: 1500n, currency: 'USD' } }),
    ).toEqual({ result: 'MATCHED', reasons: [] });
  });

  it('does not match 12 seats against 10', () => {
    expect(
      matchPurchaseInvoice({ ...FIGMA, quantity: 12, unitPriceOriginal: { amountMinor: 1500n, currency: 'USD' } }),
    ).toEqual({ result: 'PRICE_QUANTITY_EXCEPTION', reasons: ['QUANTITY'] });
  });

  it('does not match fewer seats either: the count is what was bought', () => {
    expect(
      matchPurchaseInvoice({ ...FIGMA, quantity: 9, unitPriceOriginal: { amountMinor: 1500n, currency: 'USD' } }),
    ).toMatchObject({ result: 'PRICE_QUANTITY_EXCEPTION', reasons: ['QUANTITY'] });
  });

  it('does not match a price of one that differs, in the currency it was stated in', () => {
    expect(
      matchPurchaseInvoice({ ...FIGMA, quantity: 10, unitPriceOriginal: { amountMinor: 1800n, currency: 'USD' } }),
    ).toEqual({ result: 'PRICE_QUANTITY_EXCEPTION', reasons: ['UNIT_PRICE'] });
  });

  it('does not match the same figure in another currency: 1500 in VND is not 15 USD', () => {
    expect(
      matchPurchaseInvoice({ ...FIGMA, quantity: 10, unitPriceOriginal: { amountMinor: 1500n, currency: 'VND' } }),
    ).toMatchObject({ result: 'PRICE_QUANTITY_EXCEPTION', reasons: ['UNIT_PRICE'] });
  });

  it('names both when the count and the price differ', () => {
    expect(
      matchPurchaseInvoice({ ...FIGMA, quantity: 12, unitPriceOriginal: { amountMinor: 1800n, currency: 'USD' } }),
    ).toEqual({ result: 'PRICE_QUANTITY_EXCEPTION', reasons: ['QUANTITY', 'UNIT_PRICE'] });
  });

  it('compares the price in VND for a plan sold in VND', () => {
    const vnd = { expectedQuantity: 3, expectedUnitPrice: { amountMinor: 600_000n, currency: 'VND' } };

    expect(
      matchPurchaseInvoice({ ...vnd, quantity: 3, unitPriceOriginal: { amountMinor: 600_000n, currency: 'VND' } }),
    ).toEqual({
      result: 'MATCHED',
      reasons: [],
    });
    expect(
      matchPurchaseInvoice({ ...vnd, quantity: 3, unitPriceOriginal: { amountMinor: 650_000n, currency: 'VND' } }),
    ).toMatchObject({ result: 'PRICE_QUANTITY_EXCEPTION', reasons: ['UNIT_PRICE'] });
  });

  it('judges the count alone when nothing says what one costs, instead of opening a case on a price nobody knows', () => {
    expect(
      matchPurchaseInvoice({
        expectedQuantity: 10,
        expectedUnitPrice: null,
        quantity: 10,
        unitPriceOriginal: { amountMinor: 1500n, currency: 'USD' },
      }),
    ).toEqual({ result: 'MATCHED', reasons: [] });
    expect(
      matchPurchaseInvoice({
        expectedQuantity: 10,
        expectedUnitPrice: null,
        quantity: 11,
        unitPriceOriginal: { amountMinor: 1500n, currency: 'USD' },
      }),
    ).toMatchObject({ result: 'PRICE_QUANTITY_EXCEPTION', reasons: ['QUANTITY'] });
  });

  it('judges the price alone when nothing says how many were bought', () => {
    expect(
      matchPurchaseInvoice({
        expectedQuantity: null,
        expectedUnitPrice: { amountMinor: 1500n, currency: 'USD' },
        quantity: 7,
        unitPriceOriginal: { amountMinor: 1500n, currency: 'USD' },
      }),
    ).toEqual({ result: 'MATCHED', reasons: [] });
  });
});

describe('what differs on an invoice that was kept (RC-1: the case names the sides that do not match)', () => {
  const kept = {
    quantity: 12,
    unitPriceOriginalMinor: 1500n,
    unitPriceOriginalCurrency: 'USD',
    expectedQuantity: 10 as number | null,
    expectedUnitPriceOriginalMinor: 1500n as bigint | null,
    expectedUnitPriceOriginalCurrency: 'USD' as string | null,
  };

  it('is the count, the price, or both, in that order, read from the columns of the invoice', () => {
    expect(mismatchesOfRow(kept)).toEqual(['QUANTITY']);
    expect(mismatchesOfRow({ ...kept, quantity: 10, unitPriceOriginalMinor: 1600n })).toEqual(['UNIT_PRICE']);
    expect(mismatchesOfRow({ ...kept, unitPriceOriginalCurrency: 'EUR' })).toEqual(['QUANTITY', 'UNIT_PRICE']);
  });

  it('is nothing when the invoice matches, and nothing for a side that was not known', () => {
    expect(mismatchesOfRow({ ...kept, quantity: 10 })).toEqual([]);
    expect(
      mismatchesOfRow({
        ...kept,
        expectedQuantity: null,
        expectedUnitPriceOriginalMinor: null,
        expectedUnitPriceOriginalCurrency: null,
      }),
    ).toEqual([]);
  });
});

describe('what an invoice of a subscription or of the shared pool may cost before it is marked over (QĐ-103w(3), QĐ-104c(3), QĐ-104d)', () => {
  const pool = { quantity: 10, monthlyMinor: 200_000n, cycleMonths: 1 as number | null };

  it('is the seats bought times the price of a month times the months to the renewal day: 10 seats at 200.000 đ, 3 months left, is 6.000.000 đ', () => {
    expect(pooledInvoiceCeilingMinor({ ...pool, serviceMonth: '2026-09-01', renewalDate: '2026-12-05' })).toBe(
      6_000_000n,
    );
  });

  it('is the seats of the period times the price of the cycle when the invoice pays for the month of the renewal day or after: 8 seats, monthly, is 1.600.000 đ', () => {
    expect(
      pooledInvoiceCeilingMinor({ ...pool, quantity: 8, serviceMonth: '2026-12-01', renewalDate: '2026-12-05' }),
    ).toBe(1_600_000n);
    expect(
      pooledInvoiceCeilingMinor({ ...pool, quantity: 8, serviceMonth: '2027-01-01', renewalDate: '2026-12-05' }),
    ).toBe(1_600_000n);
  });

  it('counts the months of a cycle by the quarter and by the year when the renewal day is not ahead', () => {
    expect(
      pooledInvoiceCeilingMinor({ ...pool, cycleMonths: 12, serviceMonth: '2026-12-01', renewalDate: '2026-12-05' }),
    ).toBe(24_000_000n);
    expect(pooledInvoiceCeilingMinor({ ...pool, cycleMonths: 3, serviceMonth: '2026-12-01', renewalDate: null })).toBe(
      6_000_000n,
    );
  });

  it('counts across the year: from 11/2026 to a renewal on 05/02/2027 is 3 months', () => {
    expect(pooledInvoiceCeilingMinor({ ...pool, serviceMonth: '2026-11-01', renewalDate: '2027-02-05' })).toBe(
      6_000_000n,
    );
  });

  it('judges nothing when a side is not known: no seats, no price, or no months to count', () => {
    const base = {
      ...pool,
      quantity: 10 as number | null,
      serviceMonth: '2026-09-01',
      renewalDate: '2026-12-05' as string | null,
    };

    expect(pooledInvoiceCeilingMinor({ ...base, quantity: null })).toBeNull();
    expect(pooledInvoiceCeilingMinor({ ...base, monthlyMinor: null })).toBeNull();
    expect(pooledInvoiceCeilingMinor({ ...base, renewalDate: null, cycleMonths: null })).toBeNull();
  });
});
