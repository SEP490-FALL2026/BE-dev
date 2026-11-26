import { SubscriptionVendorAdminsRequiredError } from '../subscription.errors';
import { toSubscriptionApiException } from '../subscription.http-errors';
import { assertVendorAdminsRecorded, vendorAdminFlags, withoutVendorAdminDetail } from './subscription-pool.policy';

describe('the vendor admins of a plan that needs them (QĐ-110k, QĐ-110u, R-53)', () => {
  describe('assertVendorAdminsRecorded: a plan that needs admins is not activated without two working IT Admins', () => {
    it.each([[0], [1]])('refuses a plan that needs them with %i recorded', (given) => {
      let caught: unknown;
      try {
        assertVendorAdminsRecorded({ needs: true, given, planId: 'p-1' });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SubscriptionVendorAdminsRequiredError);
      expect((toSubscriptionApiException(caught) as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
        code: 'SUBSCRIPTION.VENDOR_ADMINS_REQUIRED',
      });
    });

    it('lets it through with two or more', () => {
      expect(() => assertVendorAdminsRecorded({ needs: true, given: 2, planId: 'p-1' })).not.toThrow();
      expect(() => assertVendorAdminsRecorded({ needs: true, given: 5, planId: 'p-1' })).not.toThrow();
    });

    it('never judges a plan that needs none (K1, K5, K4 with no admin console)', () => {
      expect(() => assertVendorAdminsRecorded({ needs: false, given: 0, planId: 'p-1' })).not.toThrow();
    });
  });

  describe('vendorAdminFlags: what the reader sees, never a refusal (a subscription older than the rule only carries the flags)', () => {
    const working = (n: number) =>
      Array.from({ length: n }, (_unused, index) => ({ employeeId: `e${index}`, working: true }));

    it('says below the minimum when fewer than two of the admins recorded still work', () => {
      expect(vendorAdminFlags({ needs: true, admins: working(2), ownerAccountEmail: 'it@acme.vn' })).toEqual({
        vendorAdminsBelowMinimum: false,
        ownerAccountEmailMissing: false,
      });
      expect(
        vendorAdminFlags({
          needs: true,
          admins: [...working(1), { employeeId: 'gone', working: false }],
          ownerAccountEmail: 'it@acme.vn',
        }),
      ).toMatchObject({ vendorAdminsBelowMinimum: true });
      expect(vendorAdminFlags({ needs: true, admins: [], ownerAccountEmail: null })).toEqual({
        vendorAdminsBelowMinimum: true,
        ownerAccountEmailMissing: true,
      });
    });

    it('says the email of the company account is missing only when the plan needs admins and none is recorded', () => {
      expect(vendorAdminFlags({ needs: true, admins: working(3), ownerAccountEmail: null })).toMatchObject({
        ownerAccountEmailMissing: true,
      });
    });

    it('is quiet for a plan that needs no admins, whatever it holds', () => {
      expect(vendorAdminFlags({ needs: false, admins: [], ownerAccountEmail: null })).toEqual({
        vendorAdminsBelowMinimum: false,
        ownerAccountEmailMissing: false,
      });
    });
  });
});

describe('withoutVendorAdminDetail: only an IT Admin reads who administers a plan at the vendor (SPEC P19)', () => {
  const view = {
    id: 's1',
    vendorAdmins: [{ employeeId: 'a', employeeCode: 'E-A', fullName: 'A', role: 'OWNER' as const, working: true }],
    ownerAccountEmail: 'it@acme.vn',
    adminNote: 'a note',
    vendorAdminsBelowMinimum: true,
    ownerAccountEmailMissing: false,
  };

  it('empties the people, the email and the note, and keeps everything else, the two flags included', () => {
    expect(withoutVendorAdminDetail(view)).toEqual({
      ...view,
      vendorAdmins: [],
      ownerAccountEmail: null,
      adminNote: null,
    });
  });

  it('does not change the view it was given', () => {
    withoutVendorAdminDetail(view);

    expect(view.vendorAdmins).toHaveLength(1);
    expect(view.ownerAccountEmail).toBe('it@acme.vn');
  });
});
