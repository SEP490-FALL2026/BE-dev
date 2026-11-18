import type { UseItem } from '../public/organization-use.types';

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

/**
 * The department a Cost Center is created for does not exist in the organization or is no longer in use (`QĐ-87d(1)`:
 * Finance creates the Cost Center for a department that exists, and a retired department gets none).
 */
export class CostCenterDepartmentNotActiveError extends Error {
  constructor() {
    super('A cost center is created for a department that exists and is in use.');
    this.name = 'CostCenterDepartmentNotActiveError';
  }
}

/** The department already has a Cost Center in use: it has at most one, and a new one comes only after that is retired. */
export class CostCenterDepartmentAlreadyLinkedError extends Error {
  constructor(readonly departmentId: string) {
    super('The department already has a cost center in use.');
    this.name = 'CostCenterDepartmentAlreadyLinkedError';
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

/**
 * Open obligations still sit on the Cost Center, so Finance cannot retire it yet (`US-04-09` AC-3, `QĐ-87d(2)`): the Requests with a
 * cost that are not over and the commitments still held, each the first of them and how many there are in all. The people in the
 * department are not an obligation. Invoices and statements not yet reconciled are G8/G9 and join when their tables exist.
 */
export interface CostCenterInUseGroups {
  requests: { items: UseItem[]; total: number };
  commitments: { items: UseItem[]; total: number };
}

export class CostCenterInUseError extends Error {
  constructor(
    /** The department the Cost Center belongs to, for the reader of the refusal. */
    readonly department: { id: string; code: string; name: string } | null,
    readonly groups: CostCenterInUseGroups,
  ) {
    super('The cost center still has open obligations: Requests with a cost that are not over or commitments held.');
    this.name = 'CostCenterInUseError';
  }
}

/** The caller is not Finance (nor, to read, the Super Admin): the catalogue is Finance's, decided in the service whatever the route let through (`F13`). */
export class CostCenterForbiddenError extends Error {
  constructor() {
    super('You do not have permission to perform this action on cost centers.');
    this.name = 'CostCenterForbiddenError';
  }
}
