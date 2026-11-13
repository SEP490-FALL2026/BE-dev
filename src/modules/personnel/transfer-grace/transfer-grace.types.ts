import type { BusinessDate } from '../../../core/business-date';

/** What the grace of a transfer needs to know of it when it takes effect (a `TransferRecord` has all of it; this folder does not import the capability of the transfer). */
export interface GraceTransferFacts {
  id: string;
  organizationId: string;
  employeeId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  effectiveOn: BusinessDate;
}

/** What opening the grace did (nothing when it was open already). */
export interface GraceOpened {
  graceEndsOn: BusinessDate;
  graceReminderOn: BusinessDate;
  rightCount: number;
  requestsCancelled: number;
  requestsToCheck: number;
}
