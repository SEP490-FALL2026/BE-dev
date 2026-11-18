import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { CONTRACTS, INVOICES, contractBody, invoiceMove, invoiceBody, resubmissionBody } from './demo-documents.steps';

function context() {
  const ids = emptyIds();
  for (const subscription of fixture.subscriptions)
    ids.subscriptions.set(subscription.key, `subscription-${subscription.key}`);
  ids.vendors.set('zoom', 'vendor-zoom');
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
  it('has unique invoice numbers and preserves the intentional Postman discrepancy', () => {
    expect(INVOICES).toHaveLength(10);
    expect(new Set(INVOICES.map(({ number }) => number)).size).toBe(10);
    const resubmitted = INVOICES.find(({ number }) => number === 'SV-INV-007')!;
    expect(resubmitted).toMatchObject({ target: 'RESUBMITTED', resubmitAs: 'SV-INV-007R' });
    expect(INVOICES.find(({ number }) => number === 'SV-INV-004')!.quantity).toBe(12);
    expect(INVOICES.find(({ number }) => number === 'SV-INV-010')!.quantity).toBe(7);
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
