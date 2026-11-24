import type { BusinessDate } from '../../../core/business-date';
import type { CollectionState } from '../devices-collection-state.policy';

/** Why a registration of a machine to one person ended. */
export type DeviceRegistrationEndCause =
  | 'HOLDER_CHANGED'
  | 'DEVICE_RETIRED'
  | 'DEPARTURE'
  | 'EMPLOYEE_LEFT'
  /** The block of a departure took effect (the last working day is past) and the handover was cancelled: the unlock never revives it (`QĐ-100z`). */
  | 'DEPARTURE_BLOCKED'
  /** The machine went back to the store. */
  | 'RETURNED';

/** Ends every open registration of a person (a machine is never held by two people, a person may hold many machines). */
export interface EndRegistrationsOfHolderInput {
  employeeId: string;
  end: { at: Date };
  cause: DeviceRegistrationEndCause;
}

/** The registrations that were ended, by id, so the caller can tell whether it changed anything. */
export interface EndedRegistrations {
  registrationIds: string[];
}

/** Where a machine stands in the register: what `GET /devices?state=` filters by. */
export type DeviceCollectionState = CollectionState;

export type DeviceSessionState = 'ACTIVE' | 'AWAITING_ACKNOWLEDGEMENT' | 'COLLECTION_STOPPED';

/** What a decision on data needs of the machine a credential belongs to, read under a shared lock of its registration. */
export interface DeviceIntakeContext {
  organizationId: string;
  deviceId: string;
  registrationId: string;
  credentialId: string;
  state: DeviceSessionState;
  acceptFromAt: Date | null;
  acceptUntilAt: Date | null;
  /** The machine is collected from and the notice in force names the status of tools. */
  toolStatusAcknowledged: boolean;
  /** The time zone of the organization, in which the days of the data are told. */
  timeZone: string;
}

export interface ReturnDueFacts {
  accessBlockMode: 'BLOCK_NOW' | 'WITH_LAST_DAY';
  lastWorkingDay: BusinessDate | null;
  today: BusinessDate;
}

export interface OpenReturnTasksForDepartureInput {
  employeeId: string;
  caseId: string;
  departmentId: string | null;
  dueOn: BusinessDate;
}

export interface MoveReturnTaskDueInput {
  caseId: string;
  dueOn: BusinessDate;
}

export interface CancelReturnTasksOfCaseInput {
  caseId: string;
  at: Date;
}

export interface ReturnTaskCountScope {
  organizationId: string;
  actingDepartmentIds: readonly string[];
  includeTaskIds?: readonly string[] | undefined;
  excludeEmployeeId: string;
}

export interface ReturnTaskCounts {
  open: number;
  overdue: number;
}

export interface DeviceInitialRecordProgress {
  initialRecords: number;
  signaturesMissing: number;
}
