export class PlanTermsPlanNotFoundError extends Error {
  constructor() {
    super('The plan does not exist.');
    this.name = 'PlanTermsPlanNotFoundError';
  }
}

export class PlanTermsNotApplicableError extends Error {
  constructor(message = 'A K5 plan of an internal application has no terms.') {
    super(message);
    this.name = 'PlanTermsNotApplicableError';
  }
}

export class PlanTermsUrlInvalidError extends Error {
  constructor() {
    super('The terms link must be an http or https address of at most 2000 characters.');
    this.name = 'PlanTermsUrlInvalidError';
  }
}

export class PlanTermsTextInvalidError extends Error {
  constructor() {
    super('A text of the terms is at most 2000 characters.');
    this.name = 'PlanTermsTextInvalidError';
  }
}

export class PlanTermsReviewDateInFutureError extends Error {
  constructor() {
    super('The review date cannot be a day that has not come yet.');
    this.name = 'PlanTermsReviewDateInFutureError';
  }
}

export class PlanTermsInstallLimitNumericOnlyForK4Error extends Error {
  constructor() {
    super('Only a K4 plan keeps the install limit as a number.');
    this.name = 'PlanTermsInstallLimitNumericOnlyForK4Error';
  }
}
