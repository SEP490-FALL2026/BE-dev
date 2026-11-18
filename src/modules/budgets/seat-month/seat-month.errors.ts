/**
 * A month charged on request failed for some subscriptions, after every subscription was tried. It says the message of the first failure,
 * keeps it as its cause, and names the subscriptions whose charge failed, so the closing of a review month can show which are not ready.
 */
export class SeatMonthChargeError extends Error {
  constructor(
    readonly subscriptionIds: readonly string[],
    firstFailure: Error,
  ) {
    super(firstFailure.message, { cause: firstFailure });
    this.name = 'SeatMonthChargeError';
  }
}
