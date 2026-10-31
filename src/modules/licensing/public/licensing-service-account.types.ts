import type { BusinessDate } from '../../../core/business-date';
import type { EmployeeWorkState } from '../../organization/public/organization.types';

/** The kind of personnel file that waits on a person: a transfer to another department, or the departure of the person. */
export type PersonnelFileKind = 'TRANSFER' | 'OFFBOARDING';

/** A personnel file that has not been closed and the day it takes effect (the earliest one when a person has more than one). */
export interface PendingPersonnelFile {
  employeeId: string;
  fileKind: PersonnelFileKind;
  fileId: string;
  dueOn: BusinessDate;
}

/** What the module of personnel is asked: who has a file that waits, optionally only these people or only those whose day passed. */
export interface PendingFileQuery {
  employeeIds?: readonly string[];
  /** Only the files whose day is before this one. */
  dueBefore?: BusinessDate;
  limit: number;
}

/** A service account that is still open and the person who answers for it: what a transfer or a departure leaves to be handed on. */
export interface ServiceAccountDuty {
  assignmentId: string;
  employeeId: string;
  planId: string;
  owningDepartmentId: string;
}

/** Who takes over a service account, as the rules judge the person: read under a share lock of their row. */
export interface ResponsibleHolder {
  status: string;
  workState: EmployeeWorkState;
  employmentType: string;
  /** The department the person belongs to on the day the change takes effect, and the Unit it is charged to. */
  departmentId: string | null;
  costCenterId: string | null;
}
