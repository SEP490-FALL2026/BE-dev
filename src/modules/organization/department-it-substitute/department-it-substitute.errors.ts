export class DepartmentItSubstituteForbiddenError extends Error {
  constructor() {
    super('You do not have permission to perform this action on department IT Admin substitutes.');
    this.name = 'DepartmentItSubstituteForbiddenError';
  }
}

export class DepartmentItSubstituteNotFoundError extends Error {
  constructor() {
    super('Department IT Admin substitute appointment not found.');
    this.name = 'DepartmentItSubstituteNotFoundError';
  }
}

export class DepartmentItSubstituteAlreadyActiveError extends Error {
  constructor() {
    super('This department already has an active IT Admin substitute.');
    this.name = 'DepartmentItSubstituteAlreadyActiveError';
  }
}

export class DepartmentItSubstituteIsInChargeError extends Error {
  constructor() {
    super('The appointed substitute is already the IT Admin in charge of this department.');
    this.name = 'DepartmentItSubstituteIsInChargeError';
  }
}

export class DepartmentItSubstituteDepartmentInactiveError extends Error {
  constructor() {
    super('An inactive department cannot take a temporary IT Admin substitute.');
    this.name = 'DepartmentItSubstituteDepartmentInactiveError';
  }
}

export class DepartmentItSubstituteNotUsableError extends Error {
  constructor() {
    super('The substitute must be an active employee with a usable account holding the IT Admin role.');
    this.name = 'DepartmentItSubstituteNotUsableError';
  }
}

export class DepartmentItSubstituteAlreadyEndedError extends Error {
  constructor() {
    super('This IT Admin substitute appointment has already ended.');
    this.name = 'DepartmentItSubstituteAlreadyEndedError';
  }
}
