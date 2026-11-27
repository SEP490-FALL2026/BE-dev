import { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import {
  SubscriptionK1HasNoSubscriptionError,
  SubscriptionPerpetualIsLicenseLotError,
  SubscriptionPrimaryRetiredError,
  SubscriptionSeatCountViaLedgerError,
} from '../subscription.errors';
import { toSubscriptionApiException } from '../subscription.http-errors';
import { SEAT_LEDGER_ROUTES, assertDeclarable, assertUpdateWritesNoRetiredField } from '../subscription.policy';

function expectSubCode(fn: () => unknown, code: string): unknown {
  try {
    fn();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    const mapped = toSubscriptionApiException(error);
    expect(mapped).toBeInstanceOf(ApiException);
    expect((mapped as ApiException).getResponse()).toMatchObject({ code });
    return error;
  }
}

describe('W3-27: what a subscription no longer takes', () => {
  describe('an update', () => {
    it('refuses a number of seats, with the routes that change them in the error, and a quantity of zero too', () => {
      const first = expectSubCode(
        () => assertUpdateWritesNoRetiredField({ purchasedQuantity: 12 }),
        'SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER',
      );
      expect(first).toBeInstanceOf(SubscriptionSeatCountViaLedgerError);
      expect((first as SubscriptionSeatCountViaLedgerError).routes).toEqual(SEAT_LEDGER_ROUTES);
      expect(
        expectSubCode(
          () => assertUpdateWritesNoRetiredField({ purchasedQuantity: 0 }),
          'SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER',
        ),
      ).toBeInstanceOf(SubscriptionSeatCountViaLedgerError);
    });

    it('refuses the mark of the subscription that prices its plan, and lets the mark be taken off', () => {
      expect(
        expectSubCode(
          () => assertUpdateWritesNoRetiredField({ isPrimaryForPlan: true }),
          'SUBSCRIPTION.PRIMARY_RETIRED',
        ),
      ).toBeInstanceOf(SubscriptionPrimaryRetiredError);
      expect(() => assertUpdateWritesNoRetiredField({ isPrimaryForPlan: false })).not.toThrow();
    });

    it('lets a change of the terms alone through', () => {
      expect(() => assertUpdateWritesNoRetiredField({})).not.toThrow();
    });
  });

  describe('a declaration', () => {
    it('refuses a purchase made once before the plan is read: it is a lot', () => {
      expect(
        expectSubCode(() => assertDeclarable('PERPETUAL'), 'SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT'),
      ).toBeInstanceOf(SubscriptionPerpetualIsLicenseLotError);
    });

    it('refuses a plan of personal accounts once it is read, and takes a term subscription of any other plan', () => {
      expect(expectSubCode(() => assertDeclarable('TERM', 'K1'), 'SUBSCRIPTION.K1_HAS_NO_SUBSCRIPTION')).toBeInstanceOf(
        SubscriptionK1HasNoSubscriptionError,
      );
      expect(() => assertDeclarable('TERM', 'K2')).not.toThrow();
      expect(() => assertDeclarable('TERM')).not.toThrow();
    });
  });
});
