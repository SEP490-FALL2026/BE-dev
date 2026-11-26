import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { CONTRACTS, INVOICES, contractBody, invoiceMove, invoiceBody, resubmissionBody } from './demo-documents.steps';

function context() {
  const ids = emptyIds();
  for (const subscription of fixture.subscriptions)
    ids.subscriptions.set(subscription.key, `subscription-${subscription.key}`);
  ids.vendors.set('zoom', 'vendor-zoom');
  ids.requests.set('R18', 'request-R18');
  ids.requests.set('R56', 'request-R56');
  ids.seatPurchases.set('canva-topup', 'seat-purchase-canva');
  ids.lots.set('request:R62', 'lot-request-R62');
  return { fixture, ids, today: '2026-11-18' } as unknown as DemoRunContext;
}

describe('contracts and invoices of the expanded fixture', () => {
  it('has five contracts and gives Zoom no end date', () => {
    expect(CONTRACTS).toHaveLength(5);
    const zoom = CONTRACTS.find(({ number }) => number === 'SV-HD-ZM-01')!;
    expect(contractBody(context(), zoom)).not.toHaveProperty('effectiveTo');
    expect(contractBody(context(), zoom).effectiveFrom).toMatch(/^2026-/);
    expect(zoom.subscriptions).toEqual(['zoom-pro', 'zoom-business']);
  });
  it('rests a contract of K4 licenses on the lots that name it, never on a subscription (W3-24)', () => {
    const lotKeys = new Set(fixture.lots.map((lot) => lot.key));
    const subscriptionKeys = new Set(fixture.subscriptions.map((subscription) => subscription.key));

    for (const contract of CONTRACTS) {
      for (const key of contract.subscriptions) expect(subscriptionKeys.has(key)).toBe(true);
      for (const key of contract.lots ?? []) expect(lotKeys.has(key)).toBe(true);
      expect(contract.subscriptions.length + (contract.lots ?? []).length).toBeGreaterThan(0);
    }
    expect(CONTRACTS.find(({ number }) => number === 'SV-HD-JB-01')).toMatchObject({
      subscriptions: [],
      lots: ['jetbrains', 'jetbrains-second'],
    });
    expect(CONTRACTS.find(({ number }) => number === 'SV-HD-MS-01')).toMatchObject({ lots: ['visio-pro'] });
  });
  it('has unique invoice numbers and preserves the intentional Postman discrepancy', () => {
    expect(INVOICES).toHaveLength(14);
    expect(new Set(INVOICES.map(({ number }) => number)).size).toBe(14);
    const resubmitted = INVOICES.find(({ number }) => number === 'SV-INV-007')!;
    expect(resubmitted).toMatchObject({ target: 'RESUBMITTED', resubmitAs: 'SV-INV-007R' });
    expect(INVOICES.find(({ number }) => number === 'SV-INV-004')!.quantity).toBe(12);
    expect(INVOICES.find(({ number }) => number === 'SV-INV-010')!.quantity).toBe(7);
  });
  it('links K1 request invoices via plan referencePrice, SEAT_PURCHASE via seatPurchaseId, and K4 via licenseLotId', () => {
    const ctx = context();
    const k1 = invoiceBody(
      ctx,
      INVOICES.find(({ number }) => number === 'SV-INV-011')!,
      'doc-1',
    );
    expect(k1.link).toEqual({ requestId: 'request-R18' });
    expect(k1.unitPriceOriginal).toEqual({ amount: '500000', currency: 'VND' });

    const seatPurchase = invoiceBody(
      ctx,
      INVOICES.find(({ number }) => number === 'SV-INV-013')!,
      'doc-2',
    );
    expect(seatPurchase.link).toEqual({ subscriptionId: 'subscription-canva', seatPurchaseId: 'seat-purchase-canva' });
    expect(seatPurchase).toMatchObject({ quantity: 2, netAmount: { amount: '500000' } });

    const lot = invoiceBody(
      ctx,
      INVOICES.find(({ number }) => number === 'SV-INV-014')!,
      'doc-3',
    );
    expect(lot.link).toEqual({ licenseLotId: 'lot-request-R62' });
    expect(lot).toMatchObject({ quantity: 1, netAmount: { amount: '3000000' } });

    const jira = invoiceBody(
      ctx,
      INVOICES.find(({ number }) => number === 'SV-INV-001')!,
      'doc-4',
    );
    expect(jira.unitPriceOriginal).toEqual({ amount: '255000', currency: 'VND' });
    expect(jira.netAmount).toEqual({ amount: '2550000' });
  });
  it('resubmits a returned original only while its replacement is missing', () => {
    const spec = INVOICES.find(({ number }) => number === 'SV-INV-007')!;
    const original = { id: 'original', vendorInvoiceNumber: spec.number, state: 'RETURNED' };
    expect(invoiceMove(spec, [original])).toBe('resubmit');
    expect(
      invoiceMove(spec, [original, { id: 'replacement', vendorInvoiceNumber: 'SV-INV-007R', state: 'SUBMITTED' }]),
    ).toBe('present');
    expect(invoiceMove(spec, [{ ...original, state: 'CONFIRMED' }])).toBe('conflict');
    expect(invoiceMove(spec, [{ ...original, state: 'SUBMITTED' }])).toBe('return');
  });
  it('builds a new complete resubmission without a link or the old document', () => {
    const ctx = context();
    const spec = INVOICES.find(({ number }) => number === 'SV-INV-007')!;
    const original = invoiceBody(ctx, spec, 'old-document');
    const replacement = resubmissionBody(ctx, spec, 'new-document');
    expect(original.link).toEqual({ subscriptionId: 'subscription-notion-business' });
    expect(replacement).not.toHaveProperty('link');
    expect(replacement).toMatchObject({
      vendorInvoiceNumber: 'SV-INV-007R',
      issuedOn: '2026-11-18',
      servicePeriodMonth: '2026-11',
      quantity: 8,
      paymentSource: 'COMPANY_CARD',
      documentIds: ['new-document'],
    });
    expect(replacement.unitPriceOriginal.currency).toBe('VND');
    expect(BigInt(replacement.netAmount.amount)).toBe(BigInt(replacement.unitPriceOriginal.amount) * 8n);
  });
});
