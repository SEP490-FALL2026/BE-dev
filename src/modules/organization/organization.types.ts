import { BusinessDate } from '../../core/business-date';

export type EmploymentType = 'STAFF' | 'CONTRACTOR' | 'FREELANCER' | 'INTERN';
export type EmployeeStatus = 'ACTIVE' | 'TERMINATED';

export interface CreateOrganizationInput {
  name: string;
  timeZone: string;
  reportingCurrency: string;
}

export interface CreateCostCenterInput {
  organizationId: string;
  code: string;
  name: string;
}

export interface CreateDepartmentInput {
  organizationId: string;
  code: string;
  name: string;
  costCenterId: string;
}

export interface CreateEmployeeWithPlacementInput {
  organizationId: string;
  employeeCode: string;
  fullName: string;
  workEmail?: string | null;
  employmentType: EmploymentType;
  hireDate: BusinessDate;
  departmentId: string;
  jobTitleId: string;
}

export interface EmployeeRecord {
  id: string;
  organizationId: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  status: EmployeeStatus;
  hireDate: BusinessDate;
}

export interface EmployeeProfile {
  id: string;
  employeeCode: string;
  fullName: string;
  department: { code: string; name: string } | null;
  jobTitle: string | null;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  timeZone: string;
  reportingCurrency: string;
}
