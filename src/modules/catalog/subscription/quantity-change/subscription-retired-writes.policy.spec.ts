import {
  SubscriptionK1HasNoSubscriptionError,
  SubscriptionPerpetualIsLicenseLotError,
  SubscriptionPrimaryRetiredError,
  SubscriptionSeatCountViaLedgerError,
} from '../subscription.errors';
import { SEAT_LEDGER_ROUTES, assertDeclarable, assertUpdateWritesNoRetiredField } from '../subscription.policy';

describe('W3-27: what a subscription no longer takes', () => {
  describe('an update', () => {
    it('refuses a number of seats, with the routes that change them in the error, and a quantity of zero too', () => {
      expect(() => assertUpdateWritesNoRetiredField({ purchasedQuantity: 12 })).toThrow(
        SubscriptionSeatCountViaLedgerError,
      );
      expect(() => assertUpdateWritesNoRetiredField({ purchasedQuantity: 0 })).toThrow(
        SubscriptionSeatCountViaLedgerError,
      );
      try {
        assertUpdateWritesNoRetiredField({ purchasedQuantity: 12 });
      } catch (error) {
        expect((error as SubscriptionSeatCountViaLedgerError).routes).toEqual(SEAT_LEDGER_ROUTES);
      }
    });

    it('refuses the mark of the subscription that prices its plan, and lets the mark be taken off', () => {
      expect(() => assertUpdateWritesNoRetiredField({ isPrimaryForPlan: true })).toThrow(
        SubscriptionPrimaryRetiredError,
      );
      expect(() => assertUpdateWritesNoRetiredField({ isPrimaryForPlan: false })).not.toThrow();
    });

    it('lets a change of the terms alone through', () => {
      expect(() => assertUpdateWritesNoRetiredField({})).not.toThrow();
    });
  });

  describe('a declaration', () => {
    it('refuses a purchase made once before the plan is read: it is a lot', () => {
      expect(() => assertDeclarable('PERPETUAL')).toThrow(SubscriptionPerpetualIsLicenseLotError);
    });

    it('refuses a plan of personal accounts once it is read, and takes a term subscription of any other plan', () => {
      expect(() => assertDeclarable('TERM', 'K1')).toThrow(SubscriptionK1HasNoSubscriptionError);
      expect(() => assertDeclarable('TERM', 'K2')).not.toThrow();
      expect(() => assertDeclarable('TERM')).not.toThrow();
    });
  });
});
