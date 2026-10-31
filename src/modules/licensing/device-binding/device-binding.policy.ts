import type {
  BindingAssignment,
  BindingCheck,
  DeviceLookup,
  InstallLimitViolation,
  KeyBindingDecision,
  KeyFacts,
  KeyRelease,
} from './device-binding.types';

/*
 * The rules of binding a key of a K4 purchase to a person and a company device, judged on the answers of the device register
 * (`device-binding.types.ts`). Pure: the caller asks the register, inside its transaction, and passes the answer here. A null
 * answer means no register is installed. Nothing in the application calls these rules yet; they are the contract the K4
 * items are built on, tested against a stand-in of the register.
 */

export interface KeyBindingFacts {
  actorRoles: readonly string[];
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  assignment: BindingAssignment;
  /** The key chosen from the vault; null when the purchase has no key left in store. */
  key: KeyFacts | null;
  deviceId: string;
  /** The register's answer for the device under the lock of the binding; null when no register is installed. */
  device: DeviceLookup | null;
  /** Whether the holder must have acknowledged the device policy before a key is bound to it (an open question; off by default). */
  requireAcknowledgement: boolean;
}

type Refused = Extract<KeyBindingDecision, { allowed: false }>;
const refuse = (refusal: Refused['refusal']): Refused => ({ allowed: false, refusal });

/** The checks that need only licensing's own facts, in order. */
function judgeLocally(facts: KeyBindingFacts): Refused | null {
  if (!facts.actorRoles.includes('IT_ADMIN')) return refuse('NOT_IT_ADMIN');
  if (facts.provisioningType !== 'K4') return refuse('PLAN_NOT_K4');
  if (!facts.assignment.open) return refuse('ASSIGNMENT_NOT_OPEN');
  if (!facts.key) return refuse('NO_KEY_IN_STORE');
  if (facts.key.status === 'RETIRED') return refuse('KEY_RETIRED');
  if (facts.key.status === 'ASSIGNED' && facts.key.assignmentId !== facts.assignment.id) {
    return refuse('KEY_HELD_BY_OTHER_ASSIGNMENT');
  }

  return null;
}

/** The checks on the register's answer, in order. */
function judgeDevice(facts: KeyBindingFacts): Refused | null {
  if (facts.device === null) return refuse('DEVICE_REGISTRY_UNAVAILABLE');
  if (!facts.device.found) return refuse('DEVICE_NOT_REGISTERED');
  const device = facts.device.device;
  if (device.registration !== 'ACTIVE') return refuse('DEVICE_REGISTRATION_NOT_ACTIVE');
  if (device.holderEmployeeId !== facts.assignment.employeeId) return refuse('DEVICE_HELD_BY_OTHER_PERSON');
  if (facts.requireAcknowledgement && device.acknowledgement !== 'CONFIRMED') return refuse('DEVICE_NOT_ACKNOWLEDGED');

  return null;
}

/**
 * Whether the IT Admin may bind the key to the assignment on the device (`US-04-12` AC-5, `US-07-01` AC-10): one key holds at
 * most one open assignment, and only a registered company device that the person of the assignment holds on that day takes it.
 * Judged in a fixed order so the same facts always give the same reason: the actor, the plan, the assignment, the key, then
 * the register. A device the key is already installed on for this assignment is `ALREADY_BOUND` and changes nothing.
 */
export function judgeKeyBinding(facts: KeyBindingFacts): KeyBindingDecision {
  const refusal = judgeLocally(facts) ?? judgeDevice(facts);
  const key = facts.key;
  if (refusal || !key) return refusal ?? refuse('NO_KEY_IN_STORE');
  if (key.status === 'IN_STORE') return { allowed: true, effect: 'TAKE_FROM_STORE' };
  if (key.installations.some((installation) => installation.deviceId === facts.deviceId)) {
    return { allowed: true, effect: 'ALREADY_BOUND' };
  }

  return { allowed: true, effect: 'ADD_INSTALLATION' };
}

/**
 * A key of a K4 plan installed on more devices than the numeric limit of its terms (`US-04-11` AC-10): a warning for the IT Admin
 * naming the key, the devices and the limit. Never a revocation or a change of the assignment. A plan that is not K4, or keeps
 * its limit only as text, is never counted.
 */
export function judgeInstallLimit(input: {
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  maxDevicesPerKey: number | null;
  key: Pick<KeyFacts, 'id' | 'installations'>;
}): InstallLimitViolation | null {
  if (input.provisioningType !== 'K4' || input.maxDevicesPerKey === null) return null;
  const deviceIds = [...new Set(input.key.installations.map((installation) => installation.deviceId))].sort();
  if (deviceIds.length <= input.maxDevicesPerKey) return null;

  return { keyId: input.key.id, limit: input.maxDevicesPerKey, deviceIds };
}

/**
 * Where a key goes when its revocation is completed (`US-04-12` AC-7, AC-8; `US-07-05` AC-6, AC-7): back to the store when the
 * terms let it move to another machine, retired otherwise. The terms have no such clause yet, so an unknown clause refuses the
 * completion rather than guess.
 */
export function releaseKeyOnRevocation(terms: { transferAllowed: boolean | null }): KeyRelease {
  if (terms.transferAllowed === null) return { decided: false, refusal: 'TRANSFER_CLAUSE_MISSING' };

  return { decided: true, status: terms.transferAllowed ? 'IN_STORE' : 'RETIRED' };
}

/**
 * A binding checked again against the register (the registration ended, the device was handed to someone else): the finding
 * is a warning for the IT Admin, never a revocation by itself, since a revocation needs a decision of its own.
 */
export function checkBinding(binding: { holderEmployeeId: string }, device: DeviceLookup | null): BindingCheck {
  if (device === null) return 'DEVICE_REGISTRY_UNAVAILABLE';
  if (!device.found) return 'DEVICE_NOT_REGISTERED';
  if (device.device.holderEmployeeId !== binding.holderEmployeeId) return 'HOLDER_CHANGED';
  if (device.device.registration !== 'ACTIVE') return 'REGISTRATION_NOT_ACTIVE';

  return 'IN_ORDER';
}
