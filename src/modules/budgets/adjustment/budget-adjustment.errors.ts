import type { ShapeRefusal } from './budget-adjustment.types';

/** The adjustment does not exist, or none of its Cost Centers is the caller's to read: the two answer alike so that one cannot be probed. */
export class BudgetAdjustmentNotFoundError extends Error {
  constructor() {
    super('The adjustment does not exist.');
    this.name = 'BudgetAdjustmentNotFoundError';
  }
}

/** The adjustment is not one of the four kinds as they are meant (a Cost Center missing or stray, the same one twice, a reason that is not a transfer's, an amount not above nothing). */
export class BudgetAdjustmentShapeError extends Error {
  constructor(readonly refusal: ShapeRefusal) {
    super(`The adjustment is not made as its kind is meant (${refusal}).`);
    this.name = 'BudgetAdjustmentShapeError';
  }
}

/** A supplement or a reduction of the ceiling asks for more than what is not allocated under the annual ceiling. */
export class BudgetAdjustmentOverUnallocatedError extends Error {
  constructor(
    readonly availableMinor: bigint,
    readonly requestedMinor: bigint,
  ) {
    super('The amount is more than what is not allocated under the annual ceiling.');
    this.name = 'BudgetAdjustmentOverUnallocatedError';
  }
}

/** A return or a transfer would leave the Cost Center with a budget below the forecast of the end of its year. */
export class BudgetAdjustmentBelowForecastError extends Error {
  constructor(
    readonly costCenterId: string,
    readonly floorMinor: bigint,
    readonly afterMinor: bigint,
  ) {
    super('The Cost Center would be left with less than it is forecast to spend by the end of the year.');
    this.name = 'BudgetAdjustmentBelowForecastError';
  }
}

/** A return or a transfer takes more than the base the Cost Center has. */
export class BudgetAdjustmentOverBaseError extends Error {
  constructor(
    readonly costCenterId: string,
    readonly baseMinor: bigint,
  ) {
    super('The amount is more than the base of the Cost Center.');
    this.name = 'BudgetAdjustmentOverBaseError';
  }
}

/** A transfer because the department changed its Cost Center takes more than what is left of the effective budget of the old one (what it used stays with it). */
export class BudgetAdjustmentOverRemainingError extends Error {
  constructor(
    readonly costCenterId: string,
    readonly remainingMinor: bigint,
    readonly usedMinor: bigint,
  ) {
    super('The amount is more than what is left of the budget of the Cost Center after what it used.');
    this.name = 'BudgetAdjustmentOverRemainingError';
  }
}

/** The Cost Center that gives has no budget of the year. */
export class BudgetAdjustmentNoBudgetError extends Error {
  constructor(readonly costCenterId: string) {
    super('The Cost Center has no budget of the year to give from.');
    this.name = 'BudgetAdjustmentNoBudgetError';
  }
}

/** The adjustment was decided already: it is decided once. */
export class BudgetAdjustmentDecidedError extends Error {
  constructor() {
    super('The adjustment was decided already.');
    this.name = 'BudgetAdjustmentDecidedError';
  }
}

/** The cycle of the year still takes proposals (it is not locked yet): the budget of the year is not made, so there is nothing to adjust (`QĐ-103i` B6, `FIX-AD1` AD1-01). */
export class BudgetAdjustmentCycleNotLockedError extends Error {
  constructor(
    readonly year: number,
    readonly submissionDeadline: string,
  ) {
    super('The budget cycle of the year still takes proposals: an adjustment is made once it is locked.');
    this.name = 'BudgetAdjustmentCycleNotLockedError';
  }
}

/** The Cost Center that receives has no budget of the year yet and a proposal of `BM-10` waits for Finance to build it: the version is made from the proposal, an adjustment would take its place (`R-48`, AD1-01). */
export class BudgetAdjustmentBudgetInPreparationError extends Error {
  constructor(readonly costCenterId: string) {
    super('The budget of the Cost Center is still being prepared: a proposal waits for Finance to build its version.');
    this.name = 'BudgetAdjustmentBudgetInPreparationError';
  }
}

/** The Cost Center that receives has a version of the year that is still being decided: that one is decided first, so that two current budgets are never made. */
export class BudgetAdjustmentVersionInFlightError extends Error {
  constructor(readonly costCenterId: string) {
    super('The Cost Center has a version of the year that is still being decided.');
    this.name = 'BudgetAdjustmentVersionInFlightError';
  }
}
