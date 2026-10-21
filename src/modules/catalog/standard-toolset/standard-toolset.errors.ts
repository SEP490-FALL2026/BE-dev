/** The change carries no reason: every change of a standard toolset says why (`US-04-10` AC-2). */
export class ToolsetReasonRequiredError extends Error {
  constructor() {
    super('A change of a standard toolset needs a reason.');
    this.name = 'ToolsetReasonRequiredError';
  }
}

export class ToolsetPlanDuplicateError extends Error {
  constructor(readonly planId: string) {
    super('A plan appears once in a standard toolset.');
    this.name = 'ToolsetPlanDuplicateError';
  }
}

export class ToolsetTooManyPlansError extends Error {
  constructor() {
    super('A standard toolset has at most 50 plans.');
    this.name = 'ToolsetTooManyPlansError';
  }
}

/** The toolset names plans the catalog does not have: it holds items of the catalog only (`US-04-10` AC-9). */
export class ToolsetPlansNotFoundError extends Error {
  constructor(readonly planIds: string[]) {
    super('A standard toolset holds plans of the catalog only.');
    this.name = 'ToolsetPlansNotFoundError';
  }
}

export class ToolsetDepartmentNotFoundError extends Error {
  constructor() {
    super('The department does not exist.');
    this.name = 'ToolsetDepartmentNotFoundError';
  }
}

export class ToolsetJobTitleNotFoundError extends Error {
  constructor() {
    super('The job title does not exist.');
    this.name = 'ToolsetJobTitleNotFoundError';
  }
}

/** A toolset for a new pair needs a job title still in use (`QĐ-68d`, `QĐ-70b`); one that exists may still change. */
export class ToolsetJobTitleInactiveError extends Error {
  constructor() {
    super('A standard toolset for a new pair needs a job title that is still in use.');
    this.name = 'ToolsetJobTitleInactiveError';
  }
}

export class ToolsetDepartmentInactiveError extends Error {
  constructor() {
    super('A standard toolset for a new pair needs a department that is still active.');
    this.name = 'ToolsetDepartmentInactiveError';
  }
}

/** A department head asks about a department that is not theirs (`SoD-2`, `FR-3.7`). */
export class ToolsetOutOfScopeError extends Error {
  constructor() {
    super('A department head sees the standard toolsets of their own department only.');
    this.name = 'ToolsetOutOfScopeError';
  }
}

/** The account has no employee record, so it has no department and no job title. */
export class ToolsetEmployeeNotFoundError extends Error {
  constructor() {
    super('The account has no employee record.');
    this.name = 'ToolsetEmployeeNotFoundError';
  }
}
