import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/*
 * What licensing needs from the register of company devices (`US-09-01`) to bind a key of a K4 purchase to a person and a
 * device, to count the devices of a key and to release a key (`US-04-12` AC-5→AC-8, `US-04-11` AC-10, `US-07-01` AC-10,
 * `US-07-05` AC-6, AC-7). The register is not part of this code base yet: it is built by the Owner, and how it reaches licensing
 * (a hook licensing opens, or the public API of the register's module) is decided with the register. Nothing here is bound,
 * provided or called by the application; the port is the contract the binding is designed against and tested with a stand-in.
 * Licensing keeps only the id of a device, never its name, its tag or who holds it.
 */

/** Whether a registration of the device covers the day asked about (its validity is half-open, from – to). */
export type DeviceRegistrationState = 'ACTIVE' | 'NOT_YET_EFFECTIVE' | 'ENDED';

/**
 * The acknowledgement of the person holding the device (`BM-06` signed, then confirmed in the application): the register keeps
 * it for the collection of usage. Licensing reads it only to show it; whether a key may be bound to an unconfirmed device is an
 * open question of the Owner, so the policy takes it as a setting.
 */
export type DeviceAcknowledgement = 'UNCONFIRMED' | 'CONFIRMED' | 'STOPPED';

/** The facts of one registered company device on one day, as much as the binding of a key needs. */
export interface RegisteredDevice {
  /** The register's own id of the device record; the only value licensing stores. */
  deviceId: string;
  /** Asset tag and machine name, read when a warning or a task card names the device; never stored by licensing. */
  assetTag: string;
  hostName: string;
  /** The employee the registration covering the asked day (or the last one) gives the device to. */
  holderEmployeeId: string;
  registration: DeviceRegistrationState;
  acknowledgement: DeviceAcknowledgement;
}

/**
 * The answer about one device. `NOT_REGISTERED` is also the answer for a personal or shared machine, which the register never
 * records (`US-09-01` AC-7): licensing cannot tell them apart and does not need to.
 */
export type DeviceLookup = { found: true; device: RegisteredDevice } | { found: false; reason: 'NOT_REGISTERED' };

export interface DeviceQuery {
  organizationId: string;
  deviceId: string;
  /** The day in the calendar of the organization the binding takes effect on. */
  on: BusinessDate;
}

/**
 * The port licensing asks. Every method answers business states as values; a method rejects only when the register cannot
 * answer at all (its database fails inside the caller's transaction, which then rolls back). When no register is installed the
 * caller has no port and the binding is refused with a stable reason, never a server error.
 */
export interface DeviceRegistryPort {
  /** A read without a lock: to show the devices to choose from and to answer early, before the transaction. */
  findDevice(query: DeviceQuery): Promise<DeviceLookup>;
  /**
   * Inside the transaction that binds or releases a key: holds the registration of the device (a shared lock) until the
   * transaction ends, so a change of holder or the end of the registration waits for the binding or the binding sees it, and
   * answers again under that lock. Lock order: the purchase of the key, then the key, then the device registration.
   */
  lockDeviceForBinding(tx: DbTx, query: DeviceQuery): Promise<DeviceLookup>;
  /** The devices registered to a person and active on a day, ordered by asset tag: the choices of the K4 task card. */
  listActiveDevicesOf(query: {
    organizationId: string;
    employeeId: string;
    on: BusinessDate;
  }): Promise<RegisteredDevice[]>;
  /**
   * The device by its asset tag, as a row of the seat baseline file names it (`US-02-05` AC-11); the same answer as `findDevice`.
   * Asset tags are unique within an organization in the register (an assumption the Owner confirms).
   */
  findDeviceByAssetTag(query: { organizationId: string; assetTag: string; on: BusinessDate }): Promise<DeviceLookup>;
}

/** One device a key is installed on, as licensing would record it (key, holding assignment, device id, from when). */
export interface KeyInstallation {
  deviceId: string;
  boundOn: BusinessDate;
}

/** The key chosen from the vault, as the binding sees it. */
export interface KeyFacts {
  id: string;
  status: 'IN_STORE' | 'ASSIGNED' | 'RETIRED';
  /** The open assignment holding the key; null while it is in store or retired. */
  assignmentId: string | null;
  installations: readonly KeyInstallation[];
}

/** The assignment the key is bound to: the person, and whether it still holds its seat. */
export interface BindingAssignment {
  id: string;
  employeeId: string;
  open: boolean;
}

/** Why a binding is refused, in the order the policy judges; each is a stable code the HTTP layer will map. */
export type KeyBindingRefusal =
  | 'NOT_IT_ADMIN'
  | 'PLAN_NOT_K4'
  | 'ASSIGNMENT_NOT_OPEN'
  | 'NO_KEY_IN_STORE'
  | 'KEY_RETIRED'
  | 'KEY_HELD_BY_OTHER_ASSIGNMENT'
  | 'DEVICE_REGISTRY_UNAVAILABLE'
  | 'DEVICE_NOT_REGISTERED'
  | 'DEVICE_REGISTRATION_NOT_ACTIVE'
  | 'DEVICE_HELD_BY_OTHER_PERSON'
  | 'DEVICE_NOT_ACKNOWLEDGED';

/**
 * What a binding does when it is allowed: the first binding takes a key out of the store for the assignment; a further device
 * of the same person adds an installation of a key the assignment already holds (the count of devices is judged apart and only
 * warns); the same device again changes nothing, so a repeated command neither writes nor audits twice.
 */
export type KeyBindingDecision =
  | { allowed: false; refusal: KeyBindingRefusal }
  | { allowed: true; effect: 'TAKE_FROM_STORE' | 'ADD_INSTALLATION' | 'ALREADY_BOUND' };

/** How the vault leaves a key once its revocation is completed, by the clause of the terms on moving to another machine. */
export type KeyRelease =
  { decided: true; status: 'IN_STORE' | 'RETIRED' } | { decided: false; refusal: 'TRANSFER_CLAUSE_MISSING' };

/** What a check of a binding against the register finds. Every finding but `IN_ORDER` is a warning for the IT Admin. */
export type BindingCheck =
  'IN_ORDER' | 'DEVICE_REGISTRY_UNAVAILABLE' | 'DEVICE_NOT_REGISTERED' | 'REGISTRATION_NOT_ACTIVE' | 'HOLDER_CHANGED';

/** A key installed on more devices than the numeric limit of the terms of its K4 plan (`QĐ-66al`). */
export interface InstallLimitViolation {
  keyId: string;
  limit: number;
  deviceIds: readonly string[];
}
