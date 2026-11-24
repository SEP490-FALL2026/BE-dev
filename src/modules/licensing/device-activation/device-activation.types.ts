import type { BusinessDate } from '../../../core/business-date';

export type DeviceActivationOrigin = 'OPERATION' | 'INITIAL';
export type DeviceActivationEndCause = 'DEACTIVATED' | 'MOVED' | 'DEVICE_DISPOSED' | 'DEVICE_LOST' | 'DEVICE_VOIDED';
export type DeviceLicenseRelease = 'RETURN_TO_LOT' | 'LOST_WITH_DEVICE';

export type ActivationActor =
  | { kind: 'USER'; appUserId: string; employeeId: string; sessionId?: string | null; bySubstitute?: boolean }
  | { kind: 'SYSTEM'; correlationId: string };

export interface ActivationRecord {
  id: string;
  organizationId: string;
  deviceId: string;
  planId: string;
  licenseKeyId: string | null;
  subscriptionId: string | null;
  keyMasked: string | null;
  keyWithdrawn: boolean;
  origin: DeviceActivationOrigin;
  movedFromActivationId: string | null;
  activatedOn: BusinessDate;
  activatedAt: Date;
  activatedByAppUserId: string;
  overActivationCap: boolean;
  deactivatedOn: BusinessDate | null;
  deactivatedAt: Date | null;
  endCause: DeviceActivationEndCause | null;
  licenseReleased: boolean | null;
  closedByAppUserId: string | null;
}

export interface OpenedActivation {
  activation: ActivationRecord;
  activationsUsed: number | null;
  maxActivations: number | null;
  overActivationCap: boolean;
}

export interface OpenActivationInput {
  organizationId: string;
  deviceId: string;
  planId: string;
  licenseKeyId: string | null;
  origin: DeviceActivationOrigin;
  on: BusinessDate;
  at?: Date;
  by: ActivationActor;
}

export interface CloseActivationInput {
  activationId: string;
  cause: 'DEACTIVATED';
  licenseRelease?: DeviceLicenseRelease | undefined;
  on: BusinessDate;
  at?: Date;
  by: ActivationActor;
}

export interface MoveActivationInput {
  activationId: string;
  targetDeviceId: string;
  on: BusinessDate;
  at?: Date;
  by: ActivationActor;
}

export interface DeviceActivationDecisionInput {
  activationId: string;
  licenseRelease?: DeviceLicenseRelease | undefined;
}

export interface CloseAllDeviceActivationsInput {
  deviceId: string;
  cause: 'DEVICE_DISPOSED' | 'DEVICE_LOST' | 'DEVICE_VOIDED';
  decisions?: readonly DeviceActivationDecisionInput[] | undefined;
  on: BusinessDate;
  at?: Date;
  by: ActivationActor;
}

export interface ActivationPageFilter {
  organizationId: string;
  deviceIds?: readonly string[] | undefined;
  planId?: string | undefined;
  licenseKeyId?: string | undefined;
  state?: 'OPEN' | 'CLOSED' | 'ALL' | undefined;
  needsKeyReplacement?: boolean | undefined;
}

export interface ActivationPageResult {
  items: ActivationRecord[];
  total: number;
}
