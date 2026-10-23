export class PlanNameInvalidError extends Error {
  constructor() {
    super('A plan name must be 1 to 200 characters.');
    this.name = 'PlanNameInvalidError';
  }
}

export class PlanNoteInvalidError extends Error {
  constructor() {
    super('The revocation note is at most 2000 characters.');
    this.name = 'PlanNoteInvalidError';
  }
}

export class PlanNotFoundError extends Error {
  constructor() {
    super('The plan does not exist.');
    this.name = 'PlanNotFoundError';
  }
}

export class PlanNameTakenError extends Error {
  constructor() {
    super('The application already has a plan with this name.');
    this.name = 'PlanNameTakenError';
  }
}

export class PlanApplicationNotFoundError extends Error {
  constructor() {
    super('The application does not exist.');
    this.name = 'PlanApplicationNotFoundError';
  }
}

export class PlanApplicationRetiredError extends Error {
  constructor() {
    super('The application is retired: no plan is declared for it.');
    this.name = 'PlanApplicationRetiredError';
  }
}

export class PlanProvisioningTypeNotSupportedError extends Error {
  constructor() {
    super('The kind K3 (SSO/SCIM) is specified only and cannot be declared yet.');
    this.name = 'PlanProvisioningTypeNotSupportedError';
  }
}

export class PlanProvisioningTypeMismatchError extends Error {
  constructor() {
    super('An internal application has only K5 plans, and K5 belongs to internal applications only.');
    this.name = 'PlanProvisioningTypeMismatchError';
  }
}

export class PlanPricingModelRequiredError extends Error {
  constructor() {
    super('A plan of kind K1, K2 or K4 names its pricing model.');
    this.name = 'PlanPricingModelRequiredError';
  }
}

export class PlanPricingModelNotApplicableError extends Error {
  constructor() {
    super('A K5 plan has no pricing model.');
    this.name = 'PlanPricingModelNotApplicableError';
  }
}

export class PlanControlLevelRequiredError extends Error {
  constructor() {
    super('A plan of kind K1, K2 or K4 names its default control level.');
    this.name = 'PlanControlLevelRequiredError';
  }
}

export class PlanDataLossNoteRequiredError extends Error {
  constructor() {
    super('A plan marked as losing data on removal says in the note what is lost.');
    this.name = 'PlanDataLossNoteRequiredError';
  }
}

export class PlanUpdateEmptyError extends Error {
  constructor() {
    super('The update names no field to change.');
    this.name = 'PlanUpdateEmptyError';
  }
}

export class PlanWorkspaceProfileNotApplicableError extends Error {
  constructor() {
    super('Only a K2 plan has a workspace profile.');
    this.name = 'PlanWorkspaceProfileNotApplicableError';
  }
}

export class PlanWorkspacePersonInvalidError extends Error {
  constructor(readonly employeeId: string) {
    super('The person must be an employee still working with a usable IT Admin account.');
    this.name = 'PlanWorkspacePersonInvalidError';
  }
}

export class PlanPrimaryOwnerNotListedError extends Error {
  constructor() {
    super('The primary owner must be one of the members, with the role OWNER.');
    this.name = 'PlanPrimaryOwnerNotListedError';
  }
}

export class PlanWorkspaceMemberDuplicateError extends Error {
  constructor(readonly employeeId: string) {
    super('A person appears once among the members.');
    this.name = 'PlanWorkspaceMemberDuplicateError';
  }
}

export class PlanWorkspaceLimitExceededError extends Error {
  constructor(readonly role: string) {
    super('The members exceed the limit the vendor sets.');
    this.name = 'PlanWorkspaceLimitExceededError';
  }
}

export class PlanWorkspaceTextInvalidError extends Error {
  constructor() {
    super('A workspace text field is too long.');
    this.name = 'PlanWorkspaceTextInvalidError';
  }
}

export class PlanWorkspaceProfileBlocksTypeChangeError extends Error {
  constructor() {
    super('The plan has a workspace profile, so it cannot change to a kind that has none.');
    this.name = 'PlanWorkspaceProfileBlocksTypeChangeError';
  }
}

export class PlanTermsBlockTypeChangeError extends Error {
  constructor() {
    super('The plan keeps a numeric install limit in its terms, which only a K4 plan has.');
    this.name = 'PlanTermsBlockTypeChangeError';
  }
}

/** What the database found on the plan that the change would leave invalid (`plans_keep_children_valid`). */
export type PlanChangeBlock = 'ACTIVE_SUBSCRIPTION_WITHOUT_QUANTITY' | 'LICENSE_KEYS' | 'SUBSCRIPTIONS';

export class PlanInUseBlocksChangeError extends Error {
  constructor(readonly reason: PlanChangeBlock) {
    super('A subscription or license key of the plan would no longer fit the pricing model or kind.');
    this.name = 'PlanInUseBlocksChangeError';
  }
}
