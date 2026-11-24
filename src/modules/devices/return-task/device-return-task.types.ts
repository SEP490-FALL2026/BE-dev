import type { BusinessDate } from '../../../core/business-date';
import type { DeviceCondition } from '../devices-custody.policy';
import type { ReturnTaskState } from './device-return-task.policy';

export type DeviceSoftwareRemovalOutcome = 'REMOVED' | 'NOT_REMOVABLE';

export interface ReturnTaskRecord {
  id: string;
  organizationId: string;
  deviceId: string;
  registrationId: string;
  employeeId: string;
  offboardingCaseId: string;
  departmentId: string | null;
  dueOn: BusinessDate;
  state: ReturnTaskState;
  conditionOnReceipt: DeviceCondition | null;
  softwareRemoval: DeviceSoftwareRemovalOutcome | null;
  softwareRemovalNote: string | null;
  outcomeNote: string | null;
  handledByAppUserId: string | null;
  handledAt: Date | null;
  overdueNoticedOn: BusinessDate | null;
  createdAt: Date;
}

export interface OpenReturnTasksInput {
  employeeId: string;
  caseId: string;
  departmentId: string | null;
  dueOn: BusinessDate;
}

export interface MoveReturnTaskDueInput {
  caseId: string;
  dueOn: BusinessDate;
}

export interface CancelReturnTasksInput {
  caseId: string;
  at: Date;
}
