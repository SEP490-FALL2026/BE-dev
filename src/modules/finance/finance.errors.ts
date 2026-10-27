export class TaxProfileVendorNotFoundError extends Error {
  constructor() {
    super('The vendor does not exist.');
    this.name = 'TaxProfileVendorNotFoundError';
  }
}

export class TaxProfileTaxTypeInvalidError extends Error {
  constructor() {
    super('A tax type name must be 1 to 100 characters.');
    this.name = 'TaxProfileTaxTypeInvalidError';
  }
}

export class TaxProfileTaxTypeDuplicateError extends Error {
  constructor() {
    super('A tax type appears once in a profile.');
    this.name = 'TaxProfileTaxTypeDuplicateError';
  }
}

export class TaxProfileRateInvalidError extends Error {
  constructor(readonly taxType: string) {
    super('A rate is a percentage from 0 to 100 with at most two decimals.');
    this.name = 'TaxProfileRateInvalidError';
  }
}

export class TaxProfileTooManyLinesError extends Error {
  constructor() {
    super('A profile has at most 20 taxes.');
    this.name = 'TaxProfileTooManyLinesError';
  }
}
