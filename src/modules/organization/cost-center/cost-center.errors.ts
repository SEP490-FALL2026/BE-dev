export class CostCenterNotFoundError extends Error {
  constructor() {
    super('Cost center not found.');
    this.name = 'CostCenterNotFoundError';
  }
}

export class CostCenterCodeTakenError extends Error {
  constructor(readonly code: string) {
    super(`A cost center with the code ${code} already exists.`);
    this.name = 'CostCenterCodeTakenError';
  }
}

/** The kind is not the one the catalogue holds (US-04-09 AC-4, `QĐ-86b`: no Company, no project kind, no placeholder). */
export class CostCenterKindNotSupportedError extends Error {
  constructor() {
    super('A cost center is of kind UNIT, nothing else: the Company is not a cost center.');
    this.name = 'CostCenterKindNotSupportedError';
  }
}

/** The name stands for money with no cost center (AC-4). */
export class CostCenterNameReservedError extends Error {
  constructor() {
    super('This name is reserved: it would gather costs that have no cost center.');
    this.name = 'CostCenterNameReservedError';
  }
}

export class CostCenterNameInvalidError extends Error {
  constructor() {
    super('A cost center needs a name of at most 200 characters.');
    this.name = 'CostCenterNameInvalidError';
  }
}

/** The department still has people working in it, so its cost center cannot be retired yet (AC-3). */
export class CostCenterInUseError extends Error {
  constructor(
    readonly department: { id: string; code: string; name: string },
    readonly employees: { employeeCode: string; fullName: string }[],
    readonly totalEmployees: number,
  ) {
    super('The cost center is still in use by a department with people in it.');
    this.name = 'CostCenterInUseError';
  }
}
