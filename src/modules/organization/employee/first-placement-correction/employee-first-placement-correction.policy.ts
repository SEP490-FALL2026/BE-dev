import type { BusinessDate } from '../../../../core/business-date';
import type { FirstPlacementUse } from '../../public/organization-use.types';
import type { EmployeeStatus, EmployeeWorkState } from '../../public/organization.types';

/**
 * Why the first placement of a person cannot be corrected (`QĐ-113e`), or null when it can: the employee works, has exactly one placement,
 * that placement starts after today and nothing refers to it. In this order, so a caller always hears the first thing that is wrong. Pure.
 */
export function firstPlacementCorrectionProblem(facts: {
  status: EmployeeStatus;
  workState: EmployeeWorkState;
  placements: readonly { validFrom: BusinessDate }[];
  today: BusinessDate;
  use: FirstPlacementUse | null;
}): 'EMPLOYEE_LEAVING' | 'EMPLOYEE_INACTIVE' | 'NOT_PLACED' | 'ALREADY_EFFECTIVE' | 'IN_USE' | null {
  if (facts.workState === 'HANDING_OVER') return 'EMPLOYEE_LEAVING';
  if (facts.status !== 'ACTIVE' || facts.workState === 'LEFT') return 'EMPLOYEE_INACTIVE';
  if (facts.placements.length === 0) return 'NOT_PLACED';
  const [first] = facts.placements;
  if (facts.placements.length > 1 || !first || first.validFrom <= facts.today) return 'ALREADY_EFFECTIVE';
  if (facts.use) return 'IN_USE';

  return null;
}
