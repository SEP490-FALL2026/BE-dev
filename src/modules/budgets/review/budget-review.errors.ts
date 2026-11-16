/** The month asked for has not ended: a month is closed from the day after its last day (`QĐ-111ae`). */
export class BudgetReviewMonthNotEndedError extends Error {
  constructor(
    readonly year: number,
    readonly month: number,
  ) {
    super(`The month ${month}/${year} has not ended.`);
    this.name = 'BudgetReviewMonthNotEndedError';
  }
}

/** The month was closed already: a month is closed once, and what came after is read in the next one (`R-2`). */
export class BudgetReviewExistsError extends Error {
  constructor(
    readonly year: number,
    readonly month: number,
  ) {
    super(`The month ${month}/${year} was closed already.`);
    this.name = 'BudgetReviewExistsError';
  }
}

/** The year has no Cost Center with an effective budget: there is nothing to take a picture of, and a period with no line could not be taken back (`RV1-09`). */
export class BudgetReviewNoBudgetError extends Error {
  constructor(readonly year: number) {
    super(`The year ${year} has no effective budget to review.`);
    this.name = 'BudgetReviewNoBudgetError';
  }
}

/** The review period does not exist, or nothing of it is the caller's to read: the two answer alike so one cannot be probed. */
export class BudgetReviewNotFoundError extends Error {
  constructor() {
    super('The review period does not exist.');
    this.name = 'BudgetReviewNotFoundError';
  }
}

/** The period was signed already: it is closed for good (`QĐ-111ae`). */
export class BudgetReviewSignedError extends Error {
  constructor() {
    super('The review period was signed already.');
    this.name = 'BudgetReviewSignedError';
  }
}

/** The seat-months of the month could not all be worked out, so the figures of the month would be wrong: nothing was closed. */
export class BudgetReviewSeatMonthsError extends Error {
  constructor(cause?: unknown) {
    super('The seat-months of the month could not be worked out; the month was not closed.', { cause });
    this.name = 'BudgetReviewSeatMonthsError';
  }
}

/** The period no longer waits for explanations: a month has none to give, and a quarter that was signed is closed for good (`RV-3`). */
export class BudgetReviewNotAwaitingError extends Error {
  constructor(readonly state: string) {
    super(`The review period is ${state}, not waiting for explanations.`);
    this.name = 'BudgetReviewNotAwaitingError';
  }
}

/** The period has no line for the Cost Center. */
export class BudgetReviewLineNotFoundError extends Error {
  constructor() {
    super('The review period has no line for this Cost Center.');
    this.name = 'BudgetReviewLineNotFoundError';
  }
}

/** The line was not asked for an explanation: it is green, or the quarter was signed before the head answered (`QĐ-111ah`). */
export class BudgetReviewNotAskedError extends Error {
  constructor(readonly status: string) {
    super(`The line is ${status}: it is not asked for an explanation.`);
    this.name = 'BudgetReviewNotAskedError';
  }
}
