import type { ReleaseRefusal } from './commitment-release.policy';

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

/**
 * The version cannot be changed now: only a draft, or one sent back to Finance, is (`US-06-09`, `US-06-11`); a draft that a
 * withdrawn or given-back proposal left behind is detached and is neither changed nor sent (F36, `QĐ-91a`).
 */
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

/** A first version is built from a proposal only while there is no current budget (`INV-21`). */
export class BudgetCurrentExistsError extends Error {
  constructor() {
    super('The Cost Center already has a current budget for this year.');
    this.name = 'BudgetCurrentExistsError';
  }
}

/** The forecast by quarter does not add up to the total of the version; it is not saved (`US-06-09` AC-6). */
export class BudgetQuartersMismatchError extends Error {
  constructor() {
    super('The four quarters do not add up to the total of the version.');
    this.name = 'BudgetQuartersMismatchError';
  }
}

/** A reason is needed: to send a reserve that is not the default share of the base, or to change a line that adjusts the proposal (`US-06-09` AC-14, AC-30). */
export class BudgetReasonRequiredError extends Error {
  constructor(readonly what: 'ADJUSTMENT' | 'RESERVE') {
    super(`A reason is required for the ${what.toLowerCase()}.`);
    this.name = 'BudgetReasonRequiredError';
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

/** What Finance builds is not built by anybody else: the service refuses as well as the route (F13, `US-06-09`). */
export class BudgetNotFinanceError extends Error {
  constructor() {
    super('Only Finance does this.');
    this.name = 'BudgetNotFinanceError';
  }
}

/** Only Finance and the person who decides a version read the history of its edits (F66, `QĐ-91d`). */
export class BudgetNotAHistoryReaderError extends Error {
  constructor() {
    super('Only Finance and the person who decides the version read the history of its edits.');
    this.name = 'BudgetNotAHistoryReaderError';
  }
}

/** A line names a plan the catalog does not have (F37): nothing was written. */
export class BudgetPlanNotFoundError extends Error {
  constructor(readonly planIds: readonly string[]) {
    super('A line names a plan that does not exist.');
    this.name = 'BudgetPlanNotFoundError';
  }
}

/** Another writer took the number of the next version of the Cost Center and year first (F39): read again and send again. */
export class BudgetVersionNumberTakenError extends Error {
  constructor() {
    super('Another version took the number of this one first; read the versions again and send it again.');
    this.name = 'BudgetVersionNumberTakenError';
  }
}

/** The file of lines cannot be read at all (`US-06-09` AC-3). */
export class BudgetImportFileInvalidError extends Error {
  constructor(
    readonly reason: 'NOT_CSV' | 'MISSING_COLUMNS' | 'RETIRED_COLUMNS' | 'EMPTY' | 'TOO_MANY_ROWS',
    readonly detail?: string,
  ) {
    super(`The file cannot be read: ${reason}.`);
    this.name = 'BudgetImportFileInvalidError';
  }
}

/** The invoice of this vendor with this number was already recorded (`US-12-02` AC-11). */
export class InvoiceDuplicateError extends Error {
  constructor() {
    super('An invoice with this number from this vendor was already recorded.');
    this.name = 'InvoiceDuplicateError';
  }
}

/** The vendor of the commitment cannot be told from its request, and an invoice is not recorded without one. */
export class InvoiceVendorUnknownError extends Error {
  constructor() {
    super('The vendor of the software behind the commitment cannot be told, so an invoice cannot be recorded for it.');
    this.name = 'InvoiceVendorUnknownError';
  }
}

/** The commitment was released: no spend that was approved is left to be invoiced against it. */
export class InvoiceCommitmentReleasedError extends Error {
  constructor() {
    super('The commitment was released, so no invoice is recorded against it.');
    this.name = 'InvoiceCommitmentReleasedError';
  }
}

/** The budget cycle of the year does not exist (`QĐ-103i`). */
export class BudgetCycleNotFoundError extends Error {
  constructor() {
    super('The budget cycle of that year does not exist.');
    this.name = 'BudgetCycleNotFoundError';
  }
}

/** A year has one budget cycle. */
export class BudgetCycleExistsError extends Error {
  constructor(readonly year: number) {
    super(`The budget cycle of ${year} is already open.`);
    this.name = 'BudgetCycleExistsError';
  }
}

/** The cycle of a year before the current one is read, never opened or changed (`QĐ-82l`(4), B7). */
export class BudgetCycleYearPastError extends Error {
  constructor(readonly year: number) {
    super(`The year ${year} has passed: its budget cycle can only be read.`);
    this.name = 'BudgetCycleYearPastError';
  }
}

export class BudgetCycleDeadlinesInvalidError extends Error {
  constructor() {
    super('The decision deadline cannot be before the submission deadline.');
    this.name = 'BudgetCycleDeadlinesInvalidError';
  }
}

/** A new annual ceiling is entered with the reason the leaders changed it (`US-06-15` AC-8). */
export class BudgetCycleReasonRequiredError extends Error {
  constructor() {
    super('Changing the annual ceiling needs the reason.');
    this.name = 'BudgetCycleReasonRequiredError';
  }
}

/** A ceiling is named for a department that is not among the departments of the year. */
export class BudgetCeilingDepartmentInvalidError extends Error {
  constructor(readonly departmentIds: string[]) {
    super('A ceiling names a department that is not among the departments of the year.');
    this.name = 'BudgetCeilingDepartmentInvalidError';
  }
}

/** The division cannot be published: a department has no ceiling, a ceiling is for a department that left, or the reserve is not entered. */
export class BudgetCeilingsIncompleteError extends Error {
  constructor(
    readonly missingDepartmentIds: string[],
    readonly staleDepartmentIds: string[],
    readonly reserveMissing: boolean,
  ) {
    super('The division of the ceiling is not complete.');
    this.name = 'BudgetCeilingsIncompleteError';
  }
}

/** The ceilings and the shared-pool reserve add up to more than the annual ceiling (`R-I04`). */
export class BudgetCeilingsOverAnnualError extends Error {
  constructor(readonly gapMinor: bigint) {
    super('The ceilings of the departments and the shared-pool reserve are more than the annual ceiling.');
    this.name = 'BudgetCeilingsOverAnnualError';
  }
}

/** The department head proposes only once the cycle of the year was published (`Q-02`). */
export class BudgetCycleNotPublishedError extends Error {
  constructor(readonly year: number) {
    super(`The budget cycle of ${year} was not published yet.`);
    this.name = 'BudgetCycleNotPublishedError';
  }
}
