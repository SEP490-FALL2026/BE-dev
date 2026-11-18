/** A group with this name (ignoring case, accents and spacing) already exists. */
export class VendorGroupNameTakenError extends Error {
  constructor() {
    super('A vendor group with this name already exists.');
    this.name = 'VendorGroupNameTakenError';
  }
}

/** The group already has a service line with this name. */
export class VendorServiceLineNameTakenError extends Error {
  constructor() {
    super('This vendor group already has a service line with this name.');
    this.name = 'VendorServiceLineNameTakenError';
  }
}

export class VendorGroupNotFoundError extends Error {
  constructor() {
    super('The vendor group does not exist.');
    this.name = 'VendorGroupNotFoundError';
  }
}

export class VendorServiceLineNotFoundError extends Error {
  constructor() {
    super('The vendor service line does not exist.');
    this.name = 'VendorServiceLineNotFoundError';
  }
}

/** A name is empty after trimming, or longer than 200 characters. */
export class VendorNameInvalidError extends Error {
  constructor() {
    super('A name must be 1 to 200 characters.');
    this.name = 'VendorNameInvalidError';
  }
}

export class VendorDomainInvalidError extends Error {
  constructor(readonly value: string) {
    super('A domain must be a host such as figma.com.');
    this.name = 'VendorDomainInvalidError';
  }
}

/** A pattern is shorter than 3 or longer than 100 characters. */
export class VendorPatternInvalidError extends Error {
  constructor() {
    super('A pattern must be 3 to 100 characters.');
    this.name = 'VendorPatternInvalidError';
  }
}

export class VendorTooManyValuesError extends Error {
  constructor(readonly limit: number) {
    super(`At most ${limit} values are allowed.`);
    this.name = 'VendorTooManyValuesError';
  }
}

/** An update that changes no field. */
export class VendorUpdateEmptyError extends Error {
  constructor() {
    super('The update names no field to change.');
    this.name = 'VendorUpdateEmptyError';
  }
}

export class VendorProposalNotFoundError extends Error {
  constructor() {
    super('The proposal does not exist.');
    this.name = 'VendorProposalNotFoundError';
  }
}

export class VendorProposalAlreadyResolvedError extends Error {
  constructor() {
    super('The proposal was already resolved.');
    this.name = 'VendorProposalAlreadyResolvedError';
  }
}

/** ACCEPTED needs the service line the proposal became; DISMISSED must not name one. */
export class VendorProposalResolutionInvalidError extends Error {
  constructor() {
    super('An accepted proposal names the service line it became; a dismissed one names none.');
    this.name = 'VendorProposalResolutionInvalidError';
  }
}
