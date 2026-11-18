import type { BusinessDate } from '../../core/business-date';

/**
 * The vocabulary of the structure of the organization that the capabilities and the public contract share: the status of a
 * department and of a Cost Center, the kind of Cost Center and one head period. They live at the root so that `public/` names
 * them without importing a capability, and so that `department/` and `cost-center/` do not import each other for them.
 */
/** The Company is the root of the organization, not a Cost Center (`QĐ-86b`): there is one kind. */
export type CostCenterKind = 'UNIT';
export type CostCenterStatus = 'ACTIVE' | 'INACTIVE';
export type DepartmentStatus = 'ACTIVE' | 'INACTIVE';

export interface HeadPeriodRecord {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  validFrom: BusinessDate;
  validTo: BusinessDate | null;
}
