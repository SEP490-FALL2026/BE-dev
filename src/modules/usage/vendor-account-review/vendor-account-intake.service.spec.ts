import { businessDateAt } from '../../../core/business-date';
import type { InvoiceDiscrepancyReferral } from '../../requests/public/requests.extension-points';
import { VendorAccountIntakeService } from './vendor-account-intake.service';

const VIETNAM = 'Asia/Ho_Chi_Minh';

const referralClosedAt = (closedAt: Date): InvoiceDiscrepancyReferral => ({
  organizationId: 'org',
  caseId: 'case',
  purchaseInvoiceId: 'invoice',
  vendorId: 'vendor',
  requestId: null,
  subscriptionId: 'subscription',
  mismatches: ['UNIT_PRICE'],
  quantity: { invoice: 5, expected: 5 },
  unitPrice: { invoice: { amountMinor: 120n, currency: 'VND' }, expected: null },
  differenceMinor: 100n,
  reason: 'The invoice is dearer.',
  closedByEmployeeId: 'finance',
  closedAt,
});

describe('the day of the evidence of an invoice difference', () => {
  it('is the day of the organization the case was closed on, not the UTC day (01:00 in Vietnam is still yesterday in UTC)', async () => {
    const upsertMany = jest.fn().mockResolvedValue(1);
    const service = new VendorAccountIntakeService(
      { upsertMany } as never,
      {} as never,
      { findCurrency: jest.fn().mockResolvedValue({ minorUnit: 0 }) } as never,
      { opened: jest.fn().mockResolvedValue(undefined) } as never,
      { businessToday: jest.fn((now: Date) => Promise.resolve(businessDateAt(now, VIETNAM))) } as never,
    );

    // 2026-11-28T18:00:00Z is 01:00 on the 29th in Vietnam.
    await service.fromInvoiceReferral({} as never, referralClosedAt(new Date('2026-11-28T18:00:00.000Z')));

    expect(upsertMany).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ source: 'INVOICE_DIFFERENCE', evidenceOn: '2026-11-29' }),
    ]);
  });
});
