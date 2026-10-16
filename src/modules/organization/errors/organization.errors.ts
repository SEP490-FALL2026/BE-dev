export class OrganizationAlreadyExistsError extends Error {
  constructor() {
    super('An organization already exists for this installation.');
    this.name = 'OrganizationAlreadyExistsError';
  }
}

export class EmployeeCodeTakenError extends Error {
  constructor(readonly employeeCode: string) {
    super(`Employee code already exists: ${employeeCode}`);
    this.name = 'EmployeeCodeTakenError';
  }
}

export class EmployeeEmailTakenError extends Error {
  constructor() {
    super('The work email is already used by another employee.');
    this.name = 'EmployeeEmailTakenError';
  }
}

/** A row cannot become an employee; carries every reason at once (T-16). */
export class EmployeeRowInvalidError extends Error {
  constructor(readonly reasons: { field: string; code: string }[]) {
    super('The employee row is not valid.');
    this.name = 'EmployeeRowInvalidError';
  }
}

// --- job title catalogue (slice G2) --------------------------------------------------

export class JobTitleNotFoundError extends Error {
  constructor() {
    super('Job title not found.');
    this.name = 'JobTitleNotFoundError';
  }
}

/** The name is empty once whitespace is removed (US-02-07 AC-3). */
export class JobTitleNameRequiredError extends Error {
  constructor() {
    super('A job title needs a name.');
    this.name = 'JobTitleNameRequiredError';
  }
}

export class JobTitleNameTooLongError extends Error {
  constructor() {
    super('The job title name is too long.');
    this.name = 'JobTitleNameTooLongError';
  }
}

/** Another title (active or not) already has this name once case and whitespace are ignored (AC-2). */
export class JobTitleNameTakenError extends Error {
  constructor(readonly conflict: { id: string; name: string; status: 'ACTIVE' | 'INACTIVE' } | null) {
    super('A job title with this name already exists.');
    this.name = 'JobTitleNameTakenError';
  }
}
