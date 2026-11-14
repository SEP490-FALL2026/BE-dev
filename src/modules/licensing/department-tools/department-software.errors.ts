import type { DepartmentSoftwareItem } from './department-software.policy';

/** A place to add is already in the list of the department (the unique index said so): nothing of the request was written. */
export class DepartmentSoftwareAlreadyListedError extends Error {
  constructor(readonly places: readonly DepartmentSoftwareItem[]) {
    super('The software is already in the list of the department.');
    this.name = 'DepartmentSoftwareAlreadyListedError';
  }
}

/** A place to take out is not in the list of the department (it never was, was taken out already, or is in another department). */
export class DepartmentSoftwareEntryNotFoundError extends Error {
  constructor(readonly entryIds: readonly string[]) {
    super('A place to take out is not in the list of the department.');
    this.name = 'DepartmentSoftwareEntryNotFoundError';
  }
}

/** The proposal does not exist, or the IT Admin who asks is not in charge of its department: they cannot tell it from one that is not there. */
export class DepartmentSoftwareProposalNotFoundError extends Error {
  constructor() {
    super('The proposal does not exist.');
    this.name = 'DepartmentSoftwareProposalNotFoundError';
  }
}

/** The department already has an open proposal for the place (the partial unique index said so). */
export class DepartmentSoftwareProposalOpenError extends Error {
  constructor() {
    super('The department already has an open proposal for this software.');
    this.name = 'DepartmentSoftwareProposalOpenError';
  }
}

/** The proposal was decided already, by this IT Admin or another: it is decided once. */
export class DepartmentSoftwareProposalDecidedError extends Error {
  constructor() {
    super('The proposal was decided already.');
    this.name = 'DepartmentSoftwareProposalDecidedError';
  }
}
