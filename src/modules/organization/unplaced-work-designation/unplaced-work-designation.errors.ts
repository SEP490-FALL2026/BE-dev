export class UnplacedWorkDesignationForbiddenError extends Error {
  constructor() {
    super('You do not have permission to perform this action on unplaced-work IT Admin designations.');
    this.name = 'UnplacedWorkDesignationForbiddenError';
  }
}

export class UnplacedWorkDesignationNotFoundError extends Error {
  constructor() {
    super('Unplaced-work IT Admin designation not found.');
    this.name = 'UnplacedWorkDesignationNotFoundError';
  }
}

export class UnplacedWorkDesignationEmployeePlacedError extends Error {
  constructor() {
    super(
      'Only employees who have never been placed in a department may receive an unplaced-work IT Admin designation.',
    );
    this.name = 'UnplacedWorkDesignationEmployeePlacedError';
  }
}

export class UnplacedWorkDesignationAlreadyActiveError extends Error {
  constructor() {
    super('At least one of the requested works already has an active IT Admin designation.');
    this.name = 'UnplacedWorkDesignationAlreadyActiveError';
  }
}

export class UnplacedWorkDesignationNotUsableError extends Error {
  constructor() {
    super('The designee must be an active employee with a usable account holding the IT Admin role.');
    this.name = 'UnplacedWorkDesignationNotUsableError';
  }
}

export class UnplacedWorkDesignationAlreadyEndedError extends Error {
  constructor() {
    super('This unplaced-work IT Admin designation has already ended.');
    this.name = 'UnplacedWorkDesignationAlreadyEndedError';
  }
}
