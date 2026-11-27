import {
  bearsByHolder,
  chargedCostCenterOf,
  holderDayOf,
  isOverApprovedInvoice,
} from './purchase-invoice-charge.policy';

describe('which department bears a purchase invoice (R-51, QĐ-55b)', () => {
  describe('the day whose holder is asked', () => {
    it('is the day of the invoice period that has come: today for the month that is running, so a transfer on 16/11 counts for the period 11/2026', () => {
      expect(holderDayOf('2026-11-01', '2026-11-17')).toBe('2026-11-17');
    });

    it('is the last day of a month that has passed', () => {
      expect(holderDayOf('2026-09-01', '2026-11-17')).toBe('2026-09-30');
      expect(holderDayOf('2026-02-01', '2027-03-01')).toBe('2026-02-28');
    });

    it('is today for a month not yet begun: the invoice is paid ahead of the period', () => {
      expect(holderDayOf('2027-01-01', '2026-11-17')).toBe('2026-11-17');
    });
  });

  describe('the kind of right whose cost follows the person who holds it (QĐ-55b, QĐ-103k)', () => {
    it('is the monthly right of one person: the department that holds it in the month bears the month', () => {
      expect(bearsByHolder('K1')).toBe(true);
    });

    it('is not the key bought once (K4): the cost is one, in the department of the request that bought it, whoever holds the key later', () => {
      expect(bearsByHolder('K4')).toBe(false);
    });

    it('is not a seat of the shared pool, an internal software, or a plan not known', () => {
      expect(bearsByHolder('K2')).toBe(false);
      expect(bearsByHolder('K5')).toBe(false);
      expect(bearsByHolder(undefined)).toBe(false);
    });
  });

  describe('the Cost Center that bears it', () => {
    const request = 'cc-request';

    it('is the Cost Center of the department that holds the right in the service month', () => {
      expect(chargedCostCenterOf({ holderCostCenterIds: ['cc-new'], requestCostCenterId: request })).toBe('cc-new');
    });

    it('is the one Cost Center the holders of a group share', () => {
      expect(chargedCostCenterOf({ holderCostCenterIds: ['cc-a', 'cc-a', 'cc-a'], requestCostCenterId: request })).toBe(
        'cc-a',
      );
    });

    it('is the Cost Center of the request when the holders are in different departments: the head who asked answers for the group', () => {
      expect(chargedCostCenterOf({ holderCostCenterIds: ['cc-a', 'cc-b'], requestCostCenterId: request })).toBe(
        request,
      );
    });

    it('is the Cost Center of the request when nobody holds the right that day, or a holder has no Cost Center, or the right is not personal', () => {
      expect(chargedCostCenterOf({ holderCostCenterIds: [], requestCostCenterId: request })).toBe(request);
      expect(chargedCostCenterOf({ holderCostCenterIds: ['cc-a', null], requestCostCenterId: request })).toBe(request);
    });

    it('is nothing when there is neither', () => {
      expect(chargedCostCenterOf({ holderCostCenterIds: [], requestCostCenterId: null })).toBeNull();
    });
  });
});

describe('whether an invoice of the pool is over what was approved (QĐ-103w)', () => {
  const standard = { quantity: 10, pricing: { monthlyMinor: 500_000n, cycleMonths: 1, renewalDate: '2026-12-05' } };
  const premium = { quantity: 5, pricing: { monthlyMinor: 800_000n, cycleMonths: 1, renewalDate: '2026-12-05' } };
  const over = (netMinor: bigint, ceilingParts: Parameters<typeof isOverApprovedInvoice>[0]['ceilingParts']) =>
    isOverApprovedInvoice({ netMinor, commitmentRemainingMinor: null, ceilingParts, serviceMonth: '2026-09-01' });

  it('adds the ceiling of each line at its own price: (10 x 500.000 + 5 x 800.000) x 3 months is 27.000.000', () => {
    expect(over(27_000_000n, [standard, premium])).toBe(false);
    expect(over(27_000_001n, [standard, premium])).toBe(true);
  });

  it('is never over when nothing is judged, and not judged when the price of one part is not known', () => {
    expect(over(1n, [])).toBe(false);
    expect(over(99_000_000n, [standard, { quantity: 5, pricing: { ...premium.pricing, monthlyMinor: null } }])).toBe(
      false,
    );
  });

  it('follows the commitment when there is one, whatever the parts say', () => {
    expect(
      isOverApprovedInvoice({
        netMinor: 10n,
        commitmentRemainingMinor: 9n,
        ceilingParts: [standard],
        serviceMonth: '2026-09-01',
      }),
    ).toBe(true);
  });
});
