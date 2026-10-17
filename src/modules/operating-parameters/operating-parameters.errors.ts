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
