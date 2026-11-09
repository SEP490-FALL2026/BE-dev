import type { BusinessDate } from '../../../core/business-date';
import type { EmployeeStatus, EmployeeWorkState } from '../public/organization.types';

export function firstPlacementProblem(facts: {
  status: EmployeeStatus;
  workState: EmployeeWorkState;
  hasPlacement: boolean;
  effectiveFrom: BusinessDate;
  hireDate: BusinessDate;
  today: BusinessDate;
}): 'ALREADY_PLACED' | 'EMPLOYEE_INACTIVE' | 'EMPLOYEE_LEAVING' | 'DATE_INVALID' | null {
  if (facts.workState === 'HANDING_OVER') return 'EMPLOYEE_LEAVING';
  if (facts.status !== 'ACTIVE' || facts.workState === 'LEFT') return 'EMPLOYEE_INACTIVE';
  if (facts.hasPlacement) return 'ALREADY_PLACED';
  if (facts.effectiveFrom < facts.today || facts.effectiveFrom < facts.hireDate) return 'DATE_INVALID';
  return null;
}
