import { increasesObligation, type ObligationState } from './subscription-obligation.policy';

const price = (amountMinor: bigint, currency = 'VND'): ObligationState['unitPrice'] => ({
  amountMinor,
  currency,
  recordedOn: '2026-10-01',
});
const snapshot = (reportingMinor: bigint): ObligationState['priceSnapshot'] => ({
  rate: 1n,
  rateDate: '2026-10-01',
  rateSource: 'MANUAL',
  reportingMinor,
  reportingCurrency: 'VND',
  exchangeRateId: null,
});
const stored: ObligationState = {
  purchasedQuantity: 10,
  unitPrice: price(1_000n),
  priceSnapshot: snapshot(1_000n),
  endDate: '2026-12-31',
  renewalDate: '2026-12-31',
  autoRenew: false,
};

/** A name, what changes and, when the stored state is not the usual one, how it differs. */
type Row = [name: string, change: Partial<ObligationState>, from?: Partial<ObligationState>];

describe('what a change of a subscription creates, raises or extends (F26, spec L.7, P03-D09 = A)', () => {
  const raises: Row[] = [
    ['more seats bought', { purchasedQuantity: 11 }],
    ['a quantity where there was none', { purchasedQuantity: 3 }, { purchasedQuantity: null }],
    ['the end date later than the stored one', { endDate: '2027-01-01' }],
    ['an end date where there was none', { endDate: '2027-01-01' }, { endDate: null }],
    ['the renewal date later than the stored one', { renewalDate: '2027-01-01' }],
    ['a renewal date where there was none', { renewalDate: '2027-01-01' }, { renewalDate: null }],
    ['auto renewal switched from off to on', { autoRenew: true }],
    ['a higher unit price in the same currency', { unitPrice: price(1_001n), priceSnapshot: snapshot(1_001n) }],
    ['a unit price where there was none', { unitPrice: price(500n) }, { unitPrice: null, priceSnapshot: null }],
    [
      'a price in another currency whose reporting value is higher',
      { unitPrice: price(10n, 'USD'), priceSnapshot: snapshot(2_000n) },
    ],
    [
      'a price in another currency that cannot be shown to be no higher (no conversion)',
      { unitPrice: price(10n, 'USD'), priceSnapshot: null },
    ],
  ];
  const keeps: Row[] = [
    ['nothing changed', {}],
    ['fewer seats bought', { purchasedQuantity: 5 }],
    ['the quantity cleared', { purchasedQuantity: null }],
    ['the end date earlier than the stored one', { endDate: '2026-06-30' }],
    ['the end date cleared', { endDate: null }],
    ['the renewal date earlier than the stored one', { renewalDate: '2026-06-30' }],
    ['auto renewal switched from on to off', { autoRenew: false }, { autoRenew: true }],
    ['the same price again', { unitPrice: price(1_000n) }],
    ['a lower unit price in the same currency', { unitPrice: price(999n), priceSnapshot: snapshot(999n) }],
    [
      'a price in another currency whose reporting value is lower',
      { unitPrice: price(10n, 'USD'), priceSnapshot: snapshot(900n) },
    ],
    ['the price cleared', { unitPrice: null, priceSnapshot: null }],
  ];

  it.each(raises)('says it does: %s', (_name, change, from = {}) => {
    expect(increasesObligation({ ...stored, ...from }, { ...stored, ...from, ...change })).toBe(true);
  });

  it.each(keeps)('says it does not: %s', (_name, change, from = {}) => {
    expect(increasesObligation({ ...stored, ...from }, { ...stored, ...from, ...change })).toBe(false);
  });

  it('counts auto renewal that was already on, with a later date, only for the date', () => {
    const on = { ...stored, autoRenew: true };

    expect(increasesObligation(on, { ...on })).toBe(false);
    expect(increasesObligation(on, { ...on, endDate: '2027-06-30' })).toBe(true);
  });
});
