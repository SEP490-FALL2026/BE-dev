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

export class CostAllocationLineCountError extends Error {
  constructor(readonly lines: number) {
    super('A cost allocation has from 1 to 20 lines.');
    this.name = 'CostAllocationLineCountError';
  }
}

export class CostAllocationRatioInvalidError extends Error {
  constructor(readonly costCenterId: string) {
    super('A share is a percentage above 0 and up to 100 with at most two decimals.');
    this.name = 'CostAllocationRatioInvalidError';
  }
}

export class CostAllocationCostCenterDuplicateError extends Error {
  constructor(readonly costCenterId: string) {
    super('A Cost Center appears once in a cost allocation.');
    this.name = 'CostAllocationCostCenterDuplicateError';
  }
}

/** The shares do not add up to 100%: `totalBp` is what they add up to, in hundredths of a percent. */
export class CostAllocationTotalError extends Error {
  constructor(readonly totalBp: number) {
    super('The shares of a cost allocation add up to exactly 100%.');
    this.name = 'CostAllocationTotalError';
  }
}

/** A Cost Center the allocation names does not exist, or no longer takes new allocations because it is inactive. */
export class CostAllocationCostCenterRefusedError extends Error {
  constructor(
    readonly reason: 'NOT_FOUND' | 'INACTIVE',
    readonly costCenterIds: string[],
  ) {
    super(
      reason === 'NOT_FOUND'
        ? 'A Cost Center of the allocation does not exist.'
        : 'A Cost Center of the allocation is inactive and takes no new allocation.',
    );
    this.name = 'CostAllocationCostCenterRefusedError';
  }
}

export class CostAllocationSubscriptionNotFoundError extends Error {
  constructor() {
    super('The subscription does not exist.');
    this.name = 'CostAllocationSubscriptionNotFoundError';
  }
}
