import { BusinessDate } from '../../core/business-date';
import { CostCenterKind, CostCenterStatus } from './cost-center/cost-center.types';
import { DepartmentStatus } from './department/department.types';
import { JobTitleStatus } from './job-title/job-title.types';

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
  /**
   * The day the person becomes a member of the department (`QĐ-66ak`, R-11). Left out, it is the hire date: only
   * the installation command does that (`QĐ-67a`). Every path inside the application passes the day the person is
   * recorded, so no placement is ever made up for days before the person was in the system.
   */
  memberSince?: BusinessDate;
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

export interface EmployeeCandidate {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  /** Department name at the date asked about. */
  department: string | null;
}

/** What a people file names, as the database knows it (for the import preview and its confirmation). */
export interface EmployeeImportLookupData {
  departments: { id: string; code: string; active: boolean; costCenterActive: boolean }[];
  jobTitles: { id: string; name: string; normalizedName: string; status: JobTitleStatus }[];
  employees: {
    id: string;
    employeeCode: string;
    fullName: string;
    workEmail: string | null;
    employmentType: EmploymentType;
    hireDate: BusinessDate;
    departmentCode: string | null;
    jobTitleName: string | null;
  }[];
  emailOwners: { normalizedEmail: string; employeeCode: string }[];
}

/** What the onboarding checklist needs to know about the organization (US-02-04). */
export interface OnboardingFacts {
  activeDepartments: number;
  activeEmployees: number;
  /** Active UNIT cost centers with no department yet: the department that is created next takes one of these. */
  freeCostCenters: number;
  departmentsWithoutHead: { code: string; name: string }[];
  /** Active departments and the employee named IT Admin in charge, to be judged by the account side. */
  departmentsByItAdmin: {
    code: string;
    name: string;
    itAdminEmployeeId: string | null;
    itAdminStatus: 'ACTIVE' | 'TERMINATED' | null;
  }[];
}

/**
 * The local seed fixture items as `pnpm dev:seed` compares them (P23-RV-01): every field the fixture fixes, the link
 * between the cost center and its department, and the ids it writes against. Null when absent.
 */
export interface LocalSeedFixtureFacts {
  costCenter: {
    id: string;
    code: string;
    name: string;
    kind: CostCenterKind;
    status: CostCenterStatus;
    departmentCode: string | null;
  } | null;
  department: {
    id: string;
    code: string;
    name: string;
    status: DepartmentStatus;
    costCenterId: string;
    costCenterCode: string;
  } | null;
  jobTitle: { id: string; name: string; normalizedName: string; status: JobTitleStatus } | null;
}
