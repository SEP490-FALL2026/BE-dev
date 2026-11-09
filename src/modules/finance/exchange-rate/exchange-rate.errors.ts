/** A rate for this currency and day is already recorded; rates are never replaced (US-04-05, spec `OQ-M-01`). */
export class ExchangeRateAlreadyRecordedError extends Error {
  constructor() {
    super('A rate for this currency and day is already recorded.');
    this.name = 'ExchangeRateAlreadyRecordedError';
  }
}

/** The currency is the organization reporting currency itself: that conversion is always 1 and needs no rate. */
export class ExchangeRateSameAsReportingCurrencyError extends Error {
  constructor(readonly currency: string) {
    super(`${currency} is the reporting currency; it needs no exchange rate.`);
    this.name = 'ExchangeRateSameAsReportingCurrencyError';
  }
}

export class ExchangeRateDateInFutureError extends Error {
  constructor() {
    super('A rate cannot be entered for a day that has not come yet.');
    this.name = 'ExchangeRateDateInFutureError';
  }
}

export class ExchangeRateDateTooOldError extends Error {
  constructor() {
    super('A rate cannot be entered for a day before 2000-01-01.');
    this.name = 'ExchangeRateDateTooOldError';
  }
}
