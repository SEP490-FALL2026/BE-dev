import { chargedCostCenterOf, holderDayOf } from './purchase-invoice-charge.policy';

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
