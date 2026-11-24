/** Ordered by precedence so one deterministic custody state is derived from device flags. */
export const DEVICE_CUSTODIES = ['VOIDED', 'RETIRED', 'AWAITING_RETURN', 'ASSIGNED', 'IN_STOCK'] as const;
export type DeviceCustody = (typeof DEVICE_CUSTODIES)[number];

export const DEVICE_CONDITIONS = ['USABLE', 'IN_REPAIR', 'BROKEN'] as const;
export type DeviceCondition = (typeof DEVICE_CONDITIONS)[number];

export type DeviceKeyBindingKind = 'DEVICE_BUNDLED' | 'DEVICE_KEY';

export interface DeviceCustodyFacts {
  voidedAt: Date | null;
  retiredAt: Date | null;
  hasOpenReturnTask: boolean;
  hasOpenRegistration: boolean;
}

/** Derives where a device currently sits without storing a redundant status column. */
export function custodyOf(facts: DeviceCustodyFacts): DeviceCustody {
  if (facts.voidedAt !== null) return 'VOIDED';
  if (facts.retiredAt !== null) return 'RETIRED';
  if (facts.hasOpenReturnTask) return 'AWAITING_RETURN';
  if (facts.hasOpenRegistration) return 'ASSIGNED';

  return 'IN_STOCK';
}

export type KeyActivationTargetVerdict = 'OK' | 'VOIDED' | 'ALREADY_RETIRED' | 'AWAITING_RETURN' | 'NOT_USABLE';

/**
 * Evaluates whether a device can receive a new activation. Both bundled and keyed plans require a usable device;
 * keyed plans also reject devices awaiting return so departing holders do not receive new keys.
 */
export function judgeKeyActivationTarget(facts: {
  custody: DeviceCustody;
  condition: DeviceCondition;
  binding: DeviceKeyBindingKind;
}): KeyActivationTargetVerdict {
  if (facts.custody === 'VOIDED') return 'VOIDED';
  if (facts.custody === 'RETIRED') return 'ALREADY_RETIRED';
  if (facts.binding === 'DEVICE_KEY' && facts.custody === 'AWAITING_RETURN') return 'AWAITING_RETURN';
  if (facts.condition !== 'USABLE') return 'NOT_USABLE';

  return 'OK';
}

export interface DepartmentActingActors {
  inCharge: string | null;
  substitute: string | null;
}

export type DeviceActorVerdict = { allowed: true; bySubstitute: boolean } | { allowed: false; reason: 'NOT_IN_CHARGE' };

function evaluateDepartment(
  departmentId: string | null,
  actingByDepartment: ReadonlyMap<string, DepartmentActingActors>,
  actor: string,
): { allowed: boolean; bySubstitute: boolean } {
  if (departmentId === null) return { allowed: true, bySubstitute: false };
  const entry = actingByDepartment.get(departmentId);
  if (!entry) return { allowed: false, bySubstitute: false };
  if (entry.inCharge === actor) return { allowed: true, bySubstitute: false };
  if (entry.substitute === actor) return { allowed: true, bySubstitute: true };

  return { allowed: false, bySubstitute: false };
}

/**
 * Checks whether an IT Admin may act on a device operation based on the departments of the current holder and the
 * recipient. Devices in stock without unplaced-work restrictions allow any IT Admin; cross-department transfers
 * require covering both departments.
 */
export function judgeDeviceActor(facts: {
  holderDepartmentId: string | null;
  recipientDepartmentId: string | null;
  actingByDepartment: ReadonlyMap<string, DepartmentActingActors>;
  actor: string;
  unplacedRequired?: boolean;
  unplacedDesignee?: string | null;
}): DeviceActorVerdict {
  if (facts.unplacedRequired && facts.unplacedDesignee !== facts.actor) {
    return { allowed: false, reason: 'NOT_IN_CHARGE' };
  }

  const holderCheck = evaluateDepartment(facts.holderDepartmentId, facts.actingByDepartment, facts.actor);
  if (!holderCheck.allowed) return { allowed: false, reason: 'NOT_IN_CHARGE' };

  const recipientCheck = evaluateDepartment(facts.recipientDepartmentId, facts.actingByDepartment, facts.actor);
  if (!recipientCheck.allowed) return { allowed: false, reason: 'NOT_IN_CHARGE' };

  return {
    allowed: true,
    bySubstitute: Boolean(facts.unplacedRequired) || holderCheck.bySubstitute || recipientCheck.bySubstitute,
  };
}
