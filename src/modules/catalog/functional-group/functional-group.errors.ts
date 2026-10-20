export class FunctionalGroupNameInvalidError extends Error {
  constructor() {
    super('A functional group name must be 1 to 200 characters.');
    this.name = 'FunctionalGroupNameInvalidError';
  }
}

export class FunctionalGroupNameTakenError extends Error {
  constructor() {
    super('A functional group with this name already exists.');
    this.name = 'FunctionalGroupNameTakenError';
  }
}

export class FunctionalGroupNotFoundError extends Error {
  constructor() {
    super('The functional group does not exist.');
    this.name = 'FunctionalGroupNotFoundError';
  }
}

export class FunctionalGroupUpdateEmptyError extends Error {
  constructor() {
    super('The update names no field to change.');
    this.name = 'FunctionalGroupUpdateEmptyError';
  }
}
