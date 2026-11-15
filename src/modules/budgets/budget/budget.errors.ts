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

/** The person heads a department now and another one that starts next year: the Cost Center the work is for must be named. */
export class BudgetCostCenterRequiredError extends Error {
  constructor() {
    super('The person answers for more than one Cost Center for that year: name the one the work is for.');
    this.name = 'BudgetCostCenterRequiredError';
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

/**
 * The approval cannot hold a commitment as asked (`FR-5.8`(1), `FR-5.8a`): more or fewer than one year, a year that is not the current
 * one, an amount that is not above nothing, or no approved version of the year in the Cost Center. A safety net: the check of the budget
 * already stops a request whose year has no approved version, in the same transaction. The year is the one asked.
 */
export class BudgetCommitmentNotHoldableError extends Error {
  constructor(
    readonly reason: 'MORE_THAN_ONE_YEAR' | 'NOT_CURRENT_YEAR' | 'NOT_POSITIVE' | 'NO_APPROVED_BUDGET',
    readonly year: number | null = null,
  ) {
    super(`The request cannot hold a commitment as asked: ${reason}.`);
    this.name = 'BudgetCommitmentNotHoldableError';
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

/** A version is sent with one file at least that explains it (`QĐ-111ac`): it has none. */
export class BudgetVersionAttachmentRequiredError extends Error {
  constructor() {
    super('A version is sent with one file at least that explains it.');
    this.name = 'BudgetVersionAttachmentRequiredError';
  }
}

/** Another writer took the number of the next version of the Cost Center and year first (F39): read again and send again. */
export class BudgetVersionNumberTakenError extends Error {
  constructor() {
    super('Another version took the number of this one first; read the versions again and send it again.');
    this.name = 'BudgetVersionNumberTakenError';
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
    super(`The budget cycle of ${year} already exists.`);
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

/** Moving the submission deadline of an open cycle, or changing its annual ceiling or shared-pool reserve, is entered with the reason (`US-06-15` AC-8, AC-21). */
export class BudgetCycleReasonRequiredError extends Error {
  constructor() {
    super(
      'Moving the submission deadline, or changing the annual ceiling or the shared-pool reserve of an open cycle, needs the reason.',
    );
    this.name = 'BudgetCycleReasonRequiredError';
  }
}

/** The cycle is locked: its submission deadline has passed, and a locked cycle is never opened again (`QĐ-111z`, `R-14`). */
export class BudgetCycleLockedError extends Error {
  constructor(readonly year: number) {
    super(`The budget cycle of ${year} is locked: its submission deadline has passed.`);
    this.name = 'BudgetCycleLockedError';
  }
}

/** Only a draft cycle is deleted (`QĐ-111z`). */
export class BudgetCycleNotDraftError extends Error {
  constructor(readonly year: number) {
    super(`The budget cycle of ${year} was opened: only a draft is deleted.`);
    this.name = 'BudgetCycleNotDraftError';
  }
}

/** The cycle was opened already (`QĐ-111z`). */
export class BudgetCycleAlreadyOpenError extends Error {
  constructor(readonly year: number) {
    super(`The budget cycle of ${year} is open already.`);
    this.name = 'BudgetCycleAlreadyOpenError';
  }
}

/** The submission deadline is before today: a cycle is not opened with it, and an open one is not moved to it (`QĐ-111z`). */
export class BudgetCycleDeadlinePassedError extends Error {
  constructor() {
    super('The submission deadline is before today.');
    this.name = 'BudgetCycleDeadlinePassedError';
  }
}

/** The department head proposes only once Finance opened the cycle of the year (`QĐ-111z`, was `Q-02`). */
export class BudgetCycleNotOpenError extends Error {
  constructor(readonly year: number) {
    super(`The budget cycle of ${year} is not open yet.`);
    this.name = 'BudgetCycleNotOpenError';
  }
}

/** The versions of the year (this one included) add up to more than the annual ceiling less the shared-pool reserve (`R-I06`, `QĐ-103i`). */
export class BudgetOverAnnualCeilingError extends Error {
  constructor(
    readonly gapMinor: bigint,
    readonly availableMinor: bigint,
  ) {
    super('The versions of the year add up to more than the annual ceiling less the shared-pool reserve.');
    this.name = 'BudgetOverAnnualCeilingError';
  }
}

/** A version of the year is in another currency than the cycle: the annual check cannot add them up. */
export class BudgetCycleCurrencyMismatchError extends Error {
  constructor(
    readonly cycleCurrency: string,
    readonly versionCurrency: string,
  ) {
    super('A version of the year is not in the currency of the budget cycle.');
    this.name = 'BudgetCycleCurrencyMismatchError';
  }
}

/** Finance changed the base of a version without saying why (`QĐ-100v`). */
export class BudgetBaseReasonRequiredError extends Error {
  constructor() {
    super('Say why the base is changed.');
    this.name = 'BudgetBaseReasonRequiredError';
  }
}

/** Why a version cannot be built from the baseline (`QĐ-100h`): the reasons of `details.reason`, in the order they are checked. */
export type BaselineVersionRefusal = 'CYCLE_NOT_OPEN' | 'DEPARTMENT_NOT_IN_CYCLE' | 'BEFORE_DEADLINE' | 'HAS_PROPOSAL';

/** A version cannot be built from the baseline: the cycle, the day, the head or the proposal does not allow it (`QĐ-100h`). */
export class BudgetBaselineVersionNotAllowedError extends Error {
  constructor(readonly reason: BaselineVersionRefusal) {
    super(
      'A version is built from the baseline only after the deadline, for a department nobody heads and nobody proposed for.',
    );
    this.name = 'BudgetBaselineVersionNotAllowedError';
  }
}
