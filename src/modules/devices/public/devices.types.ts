import type { CollectionState } from '../devices-collection-state.policy';

/** Why a registration of a machine to one person ended. */
export type DeviceRegistrationEndCause = 'HOLDER_CHANGED' | 'DEVICE_RETIRED' | 'DEPARTURE' | 'EMPLOYEE_LEFT';

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
