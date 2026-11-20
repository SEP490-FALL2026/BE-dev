import type { BusinessDate } from '../../../core/business-date';
import type { EmployeeRecord } from '../public/organization.types';

/** The employee as the routes of the first placement answer (`POST /employees/{id}/first-placements` and `PATCH /employees/{id}/first-placement`). */
export function firstPlacementView(
  employee: EmployeeRecord,
  department: { id: string; code: string; name: string },
  memberSince: BusinessDate,
) {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    workEmail: employee.workEmail,
    employmentType: employee.employmentType,
    hireDate: employee.hireDate,
    contractEndDate: employee.contractEndDate,
    status: employee.status,
    workState: employee.workState,
    memberSince,
    department: { id: department.id, code: department.code, name: department.name },
    unplaced: false,
    jobTitle: employee.jobTitle ?? null,
  };
}
