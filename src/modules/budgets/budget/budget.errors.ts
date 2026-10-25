import type { ReleaseRefusal } from './commitment-release.policy';
import type { IncompleteLine } from './budget.policy';

/** The proposal does not exist, or the caller has no part in it: the two answer alike so one cannot be probed. */
export class BudgetProposalNotFoundError extends Error {
  constructor() {
    super('The proposal does not exist.');
    this.name = 'BudgetProposalNotFoundError';
  }
}

export class BudgetVersionNotFoundError extends Error {
  constructor() {
    super('The version does not exist.');
    this.name = 'BudgetVersionNotFoundError';
  }
}

export class BudgetLineNotFoundError extends Error {
  constructor() {
    super('The line does not exist.');
    this.name = 'BudgetLineNotFoundError';
  }
}

/** The Cost Center does not exist, or is not a Unit a department is charged to. */
export class BudgetCostCenterNotFoundError extends Error {
  constructor() {
    super('The Cost Center does not exist.');
    this.name = 'BudgetCostCenterNotFoundError';
  }
}

/** Only the head of a department proposes for the Cost Center of that department (`US-06-10` AC-3). */
export class BudgetNotYourCostCenterError extends Error {
  constructor() {
    super('Only the head of the department proposes a budget for its Cost Center.');
    this.name = 'BudgetNotYourCostCenterError';
  }
}

/** A year that has ended takes no new proposal or version (`US-06-10` AC-9, `US-06-09` AC-11). */
export class BudgetYearEndedError extends Error {
  constructor(readonly year: number) {
    super(`The year ${year} has ended.`);
    this.name = 'BudgetYearEndedError';
  }
}

/** Lines lack what every line must say (`US-06-10` AC-2): the line and the fields. */
export class BudgetProposalIncompleteError extends Error {
  constructor(readonly lines: readonly IncompleteLine[]) {
    super('Some lines are incomplete.');
    this.name = 'BudgetProposalIncompleteError';
  }
}

/** The purchase window of a line ends before it begins. */
export class BudgetWindowBackwardsError extends Error {
  constructor(readonly lines: readonly number[]) {
    super('The purchase window of a line ends before it begins.');
    this.name = 'BudgetWindowBackwardsError';
  }
}

/** Budgets are kept in the reporting currency of the organization. */
export class BudgetCurrencyError extends Error {
  constructor(
    readonly currency: string,
    readonly reporting: string,
  ) {
    super(`Budgets are kept in ${reporting}, not ${currency}.`);
    this.name = 'BudgetCurrencyError';
  }
}

/** The request already holds a commitment for the year: one for each year (`INV-16`, `US-06-04` AC-3). */
export class BudgetCommitmentExistsError extends Error {
  constructor(readonly year: number) {
    super(`The request already holds a commitment for the year ${year}.`);
    this.name = 'BudgetCommitmentExistsError';
  }
}

/** The commitment does not exist. */
export class BudgetCommitmentNotFoundError extends Error {
  constructor() {
    super('The commitment does not exist.');
    this.name = 'BudgetCommitmentNotFoundError';
  }
}

/** The money cannot go back to the budget as asked (`US-06-06`); the year is the one the refusal is about, when there is one. */
export class BudgetCommitmentRefusedError extends Error {
  constructor(
    readonly reason: ReleaseRefusal | 'REQUEST_OPEN',
    readonly year: number | null = null,
  ) {
    super(`The commitment cannot be released as asked: ${reason}.`);
    this.name = 'BudgetCommitmentRefusedError';
  }
}

/** The Cost Center and year already have a proposal that waits or is being reviewed (`US-06-10` AC-1). */
export class BudgetProposalOpenError extends Error {
  constructor() {
    super('The Cost Center already has a proposal for this year that is waiting or being reviewed.');
    this.name = 'BudgetProposalOpenError';
  }
}

/** The proposal is in a state that does not allow this (`US-06-10` AC-4, AC-5, AC-6; `US-06-09` AC-15). */
export class BudgetProposalStateError extends Error {
  constructor(
    readonly action: 'WITHDRAW' | 'RETURN' | 'RESUBMIT' | 'REVIEW',
    readonly state: string,
  ) {
    super(`The proposal cannot be changed this way while it is ${state}.`);
    this.name = 'BudgetProposalStateError';
  }
}

/** The version cannot be changed now: only a draft, or one sent back to Finance, is (`US-06-09`, `US-06-11`). */
export class BudgetVersionNotEditableError extends Error {
  constructor(readonly state: string) {
    super(`The version is ${state}, so it is not changed.`);
    this.name = 'BudgetVersionNotEditableError';
  }
}

/** The Cost Center and year already have a version being built or waiting for a decision. */
export class BudgetVersionInFlightError extends Error {
  constructor() {
    super('The Cost Center already has a version for this year that is not decided.');
    this.name = 'BudgetVersionInFlightError';
  }
}

/** A first version is built from a proposal only while there is no current budget; after that, by revision (`INV-21`). */
export class BudgetCurrentExistsError extends Error {
  constructor() {
    super('The Cost Center already has a current budget for this year: change it by a revision.');
    this.name = 'BudgetCurrentExistsError';
  }
}

/** A revision changes a current budget; there is none (`US-06-09` AC-7). */
export class BudgetNoCurrentError extends Error {
  constructor() {
    super('The Cost Center has no current budget for this year to revise.');
    this.name = 'BudgetNoCurrentError';
  }
}

/** The forecast by quarter does not add up to the total of the version; it is not saved (`US-06-09` AC-6). */
export class BudgetQuartersMismatchError extends Error {
  constructor() {
    super('The four quarters do not add up to the total of the version.');
    this.name = 'BudgetQuartersMismatchError';
  }
}

/** A reason is needed: to send a revision, or to change a line that adjusts the proposal (`US-06-09` AC-8, AC-14). */
export class BudgetReasonRequiredError extends Error {
  constructor(readonly what: 'REVISION' | 'ADJUSTMENT' | 'WINDOW') {
    super(`A reason is required for the ${what.toLowerCase()}.`);
    this.name = 'BudgetReasonRequiredError';
  }
}

/** The amount of a line of the current budget is not changed in place: a revision goes the whole way again (`US-06-09` AC-17). */
export class BudgetRevisionRequiredError extends Error {
  constructor() {
    super('An amount of the current budget is changed by a revision, not in place.');
    this.name = 'BudgetRevisionRequiredError';
  }
}

/** Only a line of the current budget has its window moved. */
export class BudgetVersionNotCurrentError extends Error {
  constructor() {
    super('Only a line of the current budget has its window moved.');
    this.name = 'BudgetVersionNotCurrentError';
  }
}

/** The person may not decide the version: they are not the spending approver, it is their own, or it was not sent (`US-06-11`). */
export class BudgetDecisionRefusedError extends Error {
  constructor(readonly reason: 'NOT_SPENDING_APPROVER' | 'CONFLICT_OF_INTEREST' | 'OWN_VERSION' | 'NOT_SENT') {
    super(`The version cannot be decided: ${reason}.`);
    this.name = 'BudgetDecisionRefusedError';
  }
}

/** Only Finance and the spending approver read the versions of a budget. */
export class BudgetNotAReaderError extends Error {
  constructor() {
    super('Only Finance and the spending approver read the versions of a budget.');
    this.name = 'BudgetNotAReaderError';
  }
}

/** The file of lines cannot be read at all (`US-06-09` AC-3). */
export class BudgetImportFileInvalidError extends Error {
  constructor(
    readonly reason: 'NOT_CSV' | 'MISSING_COLUMNS' | 'EMPTY' | 'TOO_MANY_ROWS',
    readonly detail?: string,
  ) {
    super(`The file cannot be read: ${reason}.`);
    this.name = 'BudgetImportFileInvalidError';
  }
}
