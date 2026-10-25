/** Errors the organization facade throws that other modules may catch. */
export class EmployeeNotFoundError extends Error {
  constructor(readonly employeeId: string) {
    super(`Employee not found: ${employeeId}`);
    this.name = 'EmployeeNotFoundError';
  }
}

/** Thrown by the facade when a person's code is already taken; callers outside the module catch it. */
export class EmployeeCodeTakenError extends Error {
  constructor(readonly employeeCode: string) {
    super(`Employee code already exists: ${employeeCode}`);
    this.name = 'EmployeeCodeTakenError';
  }
}

/** Thrown by the facade when a person's work email is already taken. */
export class EmployeeEmailTakenError extends Error {
  constructor() {
    super('The work email is already used by another employee.');
    this.name = 'EmployeeEmailTakenError';
  }
}

/** Thrown by the facade when a second organization would be created: the installation has exactly one (I-8). */
export class OrganizationAlreadyExistsError extends Error {
  constructor() {
    super('An organization already exists for this installation.');
    this.name = 'OrganizationAlreadyExistsError';
  }
}

/**
 * Thrown by the history writes of the facade when the placements of a person cannot take the change: there is no open one
 * to end, it begins on or after the day, or the database refuses the two to meet (`employee_placements_no_overlap`).
 */
export class PlacementOverlapError extends Error {
  constructor(readonly reason: 'NO_OPEN_PLACEMENT' | 'NOT_AFTER_CURRENT_PERIOD' | 'OVERLAP') {
    super(`The placements of the person cannot take this change (${reason}).`);
    this.name = 'PlacementOverlapError';
  }
}

/**
 * Thrown by `scheduleHeadHandover` when the database refuses the successor: not a member of the department for the days of the
 * period, or already heading another department (`INV-19`, `QĐ-66a`).
 */
export class HeadHandoverRefusedError extends Error {
  constructor(readonly reason: 'NOT_A_MEMBER_ON_DATE' | 'HEADS_ANOTHER_DEPARTMENT') {
    super(`The successor cannot head the department (${reason}).`);
    this.name = 'HeadHandoverRefusedError';
  }
}

/** Thrown when a placement is to begin in a department that is retired (the database refuses it, `US-03-06` AC-19). */
export class PlacementDepartmentInactiveError extends Error {
  constructor() {
    super('A retired department takes no new member.');
    this.name = 'PlacementDepartmentInactiveError';
  }
}
