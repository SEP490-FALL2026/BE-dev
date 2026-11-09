export class ParameterNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`There is no operating parameter ${key}.`);
    this.name = 'ParameterNotFoundError';
  }
}

export type ParameterValueProblem = 'WRONG_TYPE' | 'OUT_OF_RANGE' | 'INCONSISTENT';

/** The value is outside what the parameter allows (US-01-04 AC-3). Nothing was changed. */
export class ParameterValueInvalidError extends Error {
  constructor(
    readonly key: string,
    readonly problem: ParameterValueProblem,
  ) {
    super(`The value is not allowed for ${key}: ${problem}.`);
    this.name = 'ParameterValueInvalidError';
  }
}

export class NonWorkingDateInPastError extends Error {
  constructor(readonly date: string) {
    super(`${date} is not after today, so it can no longer be changed.`);
    this.name = 'NonWorkingDateInPastError';
  }
}

export class NonWorkingDateTakenError extends Error {
  constructor(readonly date: string) {
    super(`${date} is already a non-working date.`);
    this.name = 'NonWorkingDateTakenError';
  }
}

export class NonWorkingDateNotFoundError extends Error {
  constructor(readonly date: string) {
    super(`${date} is not a non-working date.`);
    this.name = 'NonWorkingDateNotFoundError';
  }
}

export class NonWorkingDateReasonInvalidError extends Error {
  constructor() {
    super('A non-working date needs a reason of at most 200 characters.');
    this.name = 'NonWorkingDateReasonInvalidError';
  }
}

export type ReportingCurrencyLock = 'EXCHANGE_RATE' | 'CONVERTED_PRICE';

/** A rate is recorded or a subscription has a converted price: the reporting currency is locked (US-01-04 AC-9). */
export class ReportingCurrencyLockedError extends Error {
  constructor(readonly reason: ReportingCurrencyLock) {
    super('The reporting currency is locked: values were already recorded in it.');
    this.name = 'ReportingCurrencyLockedError';
  }
}

/** The parameter is set by another role: the Super Admin sets its own and Finance sets Finance's (`QĐ-103z`(1)). */
export class ParameterNotYoursError extends Error {
  constructor(readonly key: string) {
    super(`The parameter ${key} is not set by your role.`);
    this.name = 'ParameterNotYoursError';
  }
}
