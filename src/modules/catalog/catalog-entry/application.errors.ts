export class ApplicationNameInvalidError extends Error {
  constructor() {
    super('An application name must be 1 to 200 characters.');
    this.name = 'ApplicationNameInvalidError';
  }
}

export class ApplicationVendorNameInvalidError extends Error {
  constructor() {
    super('A vendor name must be 1 to 200 characters.');
    this.name = 'ApplicationVendorNameInvalidError';
  }
}

export class ApplicationDomainInvalidError extends Error {
  constructor(readonly value: string) {
    super('A domain must be a host such as figma.com.');
    this.name = 'ApplicationDomainInvalidError';
  }
}

export class ApplicationTooManyDomainsError extends Error {
  constructor() {
    super('An application has at most 20 domains.');
    this.name = 'ApplicationTooManyDomainsError';
  }
}

export class ApplicationNoteInvalidError extends Error {
  constructor() {
    super('The communication note is at most 1000 characters.');
    this.name = 'ApplicationNoteInvalidError';
  }
}

export class ApplicationVendorRequiredError extends Error {
  constructor() {
    super('A SaaS or licensed application names its vendor or a dictionary service line.');
    this.name = 'ApplicationVendorRequiredError';
  }
}

export class ApplicationVendorSourceAmbiguousError extends Error {
  constructor() {
    super('Name the vendor or a dictionary service line, not both.');
    this.name = 'ApplicationVendorSourceAmbiguousError';
  }
}

export class ApplicationInternalHasNoVendorError extends Error {
  constructor() {
    super('An internal application has no vendor and no dictionary line.');
    this.name = 'ApplicationInternalHasNoVendorError';
  }
}

export class ApplicationBusinessOwnerInvalidError extends Error {
  constructor() {
    super('The Business Owner must be an employee who is still working.');
    this.name = 'ApplicationBusinessOwnerInvalidError';
  }
}

export class ApplicationFunctionalGroupInvalidError extends Error {
  constructor() {
    super('The functional group does not exist or is not active.');
    this.name = 'ApplicationFunctionalGroupInvalidError';
  }
}

export class ApplicationDictionaryLineNotFoundError extends Error {
  constructor() {
    super('The dictionary service line does not exist.');
    this.name = 'ApplicationDictionaryLineNotFoundError';
  }
}

export class ApplicationDictionaryLineMismatchError extends Error {
  constructor() {
    super('The dictionary service line is not in the dictionary group of the vendor of this application.');
    this.name = 'ApplicationDictionaryLineMismatchError';
  }
}

/**
 * The vendor had no dictionary group and nobody held the group of the line when the declaration or change read them, and
 * a simultaneous change won before this one could write (`DB-03`): the vendor took another group, or another vendor took
 * this one. Answered 409 with its own code (P29-N3); sent again, the request meets the state that change left.
 */
export class ApplicationVendorGroupChangedError extends Error {
  constructor() {
    super(
      'The dictionary group of the vendor or of the line was changed by a simultaneous request. Refresh the application and the dictionary line, then send the request again.',
    );
    this.name = 'ApplicationVendorGroupChangedError';
  }
}

export class ApplicationNotFoundError extends Error {
  constructor() {
    super('The application does not exist.');
    this.name = 'ApplicationNotFoundError';
  }
}

export class ApplicationNameTakenError extends Error {
  constructor() {
    super('The vendor already has an application with this name.');
    this.name = 'ApplicationNameTakenError';
  }
}

export class ApplicationDictionaryLineTakenError extends Error {
  constructor() {
    super('This dictionary service line already belongs to another application.');
    this.name = 'ApplicationDictionaryLineTakenError';
  }
}

export class ApplicationUpdateEmptyError extends Error {
  constructor() {
    super('The update names no field to change.');
    this.name = 'ApplicationUpdateEmptyError';
  }
}

export class ApplicationAlreadyRetiredError extends Error {
  constructor() {
    super('The application is retired already.');
    this.name = 'ApplicationAlreadyRetiredError';
  }
}

/** The Business Owner of the application has not confirmed that it may be retired (`QĐ-62n`). */
export class ApplicationRetirementNeedsConfirmationError extends Error {
  constructor() {
    super('The Business Owner has to confirm before the application is retired.');
    this.name = 'ApplicationRetirementNeedsConfirmationError';
  }
}

export interface RetirementBlockingAssignment {
  assignmentId: string;
  employeeId: string;
  planId: string;
  subscriptionId: string | null;
}

export interface RetirementBlockingSubscription {
  subscriptionId: string;
  planId: string;
  endDate: string | null;
}

/** An assignment or a subscription still holds the application, so it is not retired and nothing is revoked for it. */
export class ApplicationRetirementBlockedError extends Error {
  /** `assignments` and `subscriptions` are the first of what holds the application; the totals count them all. */
  constructor(
    readonly assignments: RetirementBlockingAssignment[],
    readonly subscriptions: RetirementBlockingSubscription[],
    readonly assignmentTotal: number = assignments.length,
    readonly subscriptionTotal: number = subscriptions.length,
  ) {
    super('Assignments or subscriptions still hold the application.');
    this.name = 'ApplicationRetirementBlockedError';
  }
}

export class ApplicationRetirementNoteRequiredError extends Error {
  constructor() {
    super('The confirmation of the Business Owner needs its content.');
    this.name = 'ApplicationRetirementNoteRequiredError';
  }
}

/** The person named is not the Business Owner of the application today, or no longer works. */
export class ApplicationRetirementNotBusinessOwnerError extends Error {
  constructor() {
    super('Only the Business Owner of the application, still working, confirms its retirement.');
    this.name = 'ApplicationRetirementNotBusinessOwnerError';
  }
}
