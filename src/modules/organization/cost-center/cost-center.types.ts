/** The Company is the root of the organization, not a Cost Center (`QĐ-86b`): there is one kind. */
export type CostCenterKind = 'UNIT';
export type CostCenterStatus = 'ACTIVE' | 'INACTIVE';

/** A Cost Center as the catalogue shows it, with the department charged to it (a UNIT has at most one). */
export interface CostCenterRecord {
  id: string;
  code: string;
  name: string;
  kind: CostCenterKind;
  status: CostCenterStatus;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
  department: { id: string; code: string; name: string } | null;
}

/**
 * A Cost Center code: letters, digits, dot, underscore and hyphen, starting with a letter or digit. Public: a
 * department code follows the same format.
 */
export const COST_CENTER_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const COST_CENTER_CODE_MAX_LENGTH = 50;
