/** The amount text is not a plain decimal: exponent, separators, sign `+`, blanks, or too many integer digits. */
export class MoneyMalformedError extends Error {
  constructor() {
    super('An amount is a plain decimal string such as "1200.00".');
    this.name = 'MoneyMalformedError';
  }
}

/** More decimals than the currency has: never rounded in silence (ADR-0007, M10). */
export class MoneyScaleExceededError extends Error {
  constructor(readonly allowedDecimals: number) {
    super(`This currency allows at most ${allowedDecimals} decimal digit(s).`);
    this.name = 'MoneyScaleExceededError';
  }
}

/** The amount, or the converted amount, is beyond what a money value may hold (M14). */
export class MoneyOutOfRangeError extends Error {
  constructor() {
    super('The amount is outside the range a money value may hold.');
    this.name = 'MoneyOutOfRangeError';
  }
}

export class RateMalformedError extends Error {
  constructor() {
    super('An exchange rate is a plain decimal string such as "25431.5".');
    this.name = 'RateMalformedError';
  }
}

/** More than ten decimals: Finance re-enters the rate at ten, it is never rounded (M15). */
export class RateScaleExceededError extends Error {
  constructor() {
    super('An exchange rate has at most 10 decimal digits.');
    this.name = 'RateScaleExceededError';
  }
}

/** Zero, negative, or 10^10 and above (M15). */
export class RateOutOfRangeError extends Error {
  constructor() {
    super('An exchange rate is greater than 0 and below 10000000000.');
    this.name = 'RateOutOfRangeError';
  }
}

/** The currency code is not one the system prices in (`currencies`). */
export class CurrencyNotSupportedError extends Error {
  constructor(readonly currency: string) {
    super(`The currency ${currency} is not supported.`);
    this.name = 'CurrencyNotSupportedError';
  }
}
