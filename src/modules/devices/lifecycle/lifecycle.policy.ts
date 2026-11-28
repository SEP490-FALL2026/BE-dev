import type { DeviceCondition, DeviceCustody } from '../devices-custody.policy';

export type GiveVerdict = 'OK' | 'VOIDED' | 'ALREADY_RETIRED' | 'AWAITING_RETURN' | 'NOT_USABLE' | 'HOLDER_UNCHANGED';

/** Checks whether a device may be handed over or reassigned to `nextHolderEmployeeId`. */
export function judgeGive(facts: {
  custody: DeviceCustody;
  condition: DeviceCondition;
  currentHolderEmployeeId: string | null;
  nextHolderEmployeeId: string;
}): GiveVerdict {
  if (facts.custody === 'VOIDED') return 'VOIDED';
  if (facts.custody === 'RETIRED') return 'ALREADY_RETIRED';
  if (facts.custody === 'AWAITING_RETURN') return 'AWAITING_RETURN';
  if (facts.condition !== 'USABLE') return 'NOT_USABLE';
  if (facts.currentHolderEmployeeId === facts.nextHolderEmployeeId) return 'HOLDER_UNCHANGED';

  return 'OK';
}

export interface SoftwareRemovalInput {
  outcome: 'REMOVED' | 'NOT_REMOVABLE';
  note?: string | null;
}

export type SoftwareRemovalVerdict = 'OK' | 'NOT_NEEDED' | 'REQUIRED' | 'NOTE_REQUIRED';

/**
 * Software removal confirmation is mandatory whenever taking a device back from a holder, and a non-removable
 * outcome must explain why so the next audit trail stays actionable.
 */
export function judgeSoftwareRemoval(facts: {
  hasCurrentHolder: boolean;
  softwareRemoval?: SoftwareRemovalInput | null;
}): SoftwareRemovalVerdict {
  if (!facts.hasCurrentHolder) return 'NOT_NEEDED';
  if (!facts.softwareRemoval) return 'REQUIRED';
  if (facts.softwareRemoval.outcome === 'NOT_REMOVABLE' && !(facts.softwareRemoval.note ?? '').trim()) {
    return 'NOTE_REQUIRED';
  }

  return 'OK';
}

export type ReturnVerdict = 'OK' | 'VOIDED' | 'ALREADY_RETIRED' | 'NOT_HELD';

/** Returns to stock require either an open registration or an open return task from an offboarding case. */
export function judgeReturn(facts: { custody: DeviceCustody }): ReturnVerdict {
  if (facts.custody === 'VOIDED') return 'VOIDED';
  if (facts.custody === 'RETIRED') return 'ALREADY_RETIRED';
  if (facts.custody === 'IN_STOCK') return 'NOT_HELD';

  return 'OK';
}

export type ConditionChangeVerdict = 'OK' | 'VOIDED' | 'ALREADY_RETIRED' | 'CONDITION_UNCHANGED';

/** Condition updates are allowed on active or awaiting-return devices as long as the condition actually changes. */
export function judgeConditionChange(facts: {
  custody: DeviceCustody;
  currentCondition: DeviceCondition;
  nextCondition: DeviceCondition;
}): ConditionChangeVerdict {
  if (facts.custody === 'VOIDED') return 'VOIDED';
  if (facts.custody === 'RETIRED') return 'ALREADY_RETIRED';
  if (facts.currentCondition === facts.nextCondition) return 'CONDITION_UNCHANGED';

  return 'OK';
}

export type RetireVerdict = 'OK' | 'VOIDED' | 'ALREADY_RETIRED' | 'AWAITING_RETURN';

/** Devices with an open return task must be closed through return-task completion rather than direct retirement. */
export function judgeRetire(facts: { custody: DeviceCustody }): RetireVerdict {
  if (facts.custody === 'VOIDED') return 'VOIDED';
  if (facts.custody === 'RETIRED') return 'ALREADY_RETIRED';
  if (facts.custody === 'AWAITING_RETURN') return 'AWAITING_RETURN';

  return 'OK';
}

export type ReplaceVerdict =
  | 'OK'
  | 'SAME_DEVICE'
  | 'VOIDED'
  | 'ALREADY_RETIRED'
  | 'AWAITING_RETURN'
  | 'NOT_HELD'
  | 'REPLACEMENT_NOT_IN_STOCK'
  | 'NOT_USABLE';

/** Validates both the assigned device being replaced and the usable in-stock replacement device. */
export function judgeReplace(facts: {
  oldDeviceId: string;
  replacementDeviceId: string;
  oldCustody: DeviceCustody;
  replacementCustody: DeviceCustody;
  replacementCondition: DeviceCondition;
}): ReplaceVerdict {
  if (facts.oldDeviceId === facts.replacementDeviceId) return 'SAME_DEVICE';
  if (facts.oldCustody === 'VOIDED') return 'VOIDED';
  if (facts.oldCustody === 'RETIRED') return 'ALREADY_RETIRED';
  if (facts.oldCustody === 'AWAITING_RETURN') return 'AWAITING_RETURN';
  if (facts.oldCustody !== 'ASSIGNED') return 'NOT_HELD';
  if (facts.replacementCustody !== 'IN_STOCK') return 'REPLACEMENT_NOT_IN_STOCK';
  if (facts.replacementCondition !== 'USABLE') return 'NOT_USABLE';

  return 'OK';
}

export type VoidVerdict =
  | 'OK'
  | 'VOIDED'
  | 'ALREADY_RETIRED'
  | 'AWAITING_RETURN'
  | 'HELD'
  | 'SIGNATURE_RECORDED'
  | 'CREDENTIAL_ISSUED'
  | 'KEY_ACTIVATION';

/**
 * Checks whether a mistakenly entered device may be voided, returning the highest-priority refusal reason.
 * Only untouched devices that never issued credentials, signatures, or keyed activations can be voided.
 */
export function judgeVoid(facts: {
  custody: DeviceCustody;
  hasOpenReturnTask: boolean;
  hasOpenRegistration: boolean;
  hasSignatureRecord: boolean;
  hasCredential: boolean;
  hasKeyActivationHistory: boolean;
}): VoidVerdict {
  if (facts.custody === 'VOIDED') return 'VOIDED';
  if (facts.custody === 'RETIRED') return 'ALREADY_RETIRED';
  if (facts.custody === 'AWAITING_RETURN' || facts.hasOpenReturnTask) return 'AWAITING_RETURN';
  if (facts.custody === 'ASSIGNED' || facts.hasOpenRegistration) return 'HELD';
  if (facts.hasSignatureRecord) return 'SIGNATURE_RECORDED';
  if (facts.hasCredential) return 'CREDENTIAL_ISSUED';
  if (facts.hasKeyActivationHistory) return 'KEY_ACTIVATION';

  return 'OK';
}
