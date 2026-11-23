export type ActivationPlanKeyBinding = 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED';

/** Initial activations from migration/onboarding are included once via `initialActivationsUsed`. */
export function activationsUsed(facts: { initialActivationsUsed: number; operationActivationCount: number }): number {
  return facts.initialActivationsUsed + facts.operationActivationCount;
}

/** Inventory screen indicator: true once used activations reach or exceed the key's nominal limit. */
export function capReached(facts: { used: number; maxActivations: number }): boolean {
  return facts.used >= facts.maxActivations;
}

/** Captured on a newly opened activation when cumulative operations exceed the key's nominal limit. */
export function isOverCap(facts: { usedAfterOpen: number; maxActivations: number }): boolean {
  return facts.usedAfterOpen > facts.maxActivations;
}

/** Lot occupancy counts active activations plus closed rows whose license was lost with the device. */
export function occupied(facts: { openDeviceKeyCount: number; closedUnreleasedCount: number }): number {
  return facts.openDeviceKeyCount + facts.closedUnreleasedCount;
}

export function freeLicenses(facts: { purchasedQuantity: number; occupiedCount: number }): number {
  return facts.purchasedQuantity - facts.occupiedCount;
}

export interface OpenActivationFacts {
  planExists: boolean;
  planKeyBinding: ActivationPlanKeyBinding | null;
  licenseKeyId: string | null;
  keyExists: boolean;
  keyPlanId: string | null;
  planId: string;
  purchaseKind: string | null;
  purchaseStatus: string | null;
  keyWithdrawn: boolean;
  freeLicenseCount: number;
}

export type OpenActivationVerdict =
  | 'OK'
  | 'PLAN_NOT_FOUND'
  | 'PLAN_NOT_DEVICE_BOUND'
  | 'KEY_NOT_ALLOWED'
  | 'KEY_REQUIRED'
  | 'KEY_NOT_FOUND'
  | 'KEY_NOT_OF_PLAN'
  | 'PURCHASE_NOT_ACTIVE'
  | 'KEY_WITHDRAWN'
  | 'LOT_FULL';

function judgeDeviceKeyOpen(facts: OpenActivationFacts): OpenActivationVerdict {
  if (facts.licenseKeyId === null) return 'KEY_REQUIRED';
  if (!facts.keyExists) return 'KEY_NOT_FOUND';
  if (facts.keyPlanId !== facts.planId) return 'KEY_NOT_OF_PLAN';
  if (facts.purchaseKind !== 'PERPETUAL' || facts.purchaseStatus !== 'ACTIVE') return 'PURCHASE_NOT_ACTIVE';
  if (facts.keyWithdrawn) return 'KEY_WITHDRAWN';
  if (facts.freeLicenseCount <= 0) return 'LOT_FULL';

  return 'OK';
}

/** Validates plan binding, key pairing, purchase status, withdrawal, and remaining lot capacity before opening. */
export function judgeOpen(facts: OpenActivationFacts): OpenActivationVerdict {
  if (!facts.planExists) return 'PLAN_NOT_FOUND';
  if (facts.planKeyBinding !== 'DEVICE_KEY' && facts.planKeyBinding !== 'DEVICE_BUNDLED') {
    return 'PLAN_NOT_DEVICE_BOUND';
  }
  if (facts.planKeyBinding === 'DEVICE_BUNDLED') {
    return facts.licenseKeyId !== null ? 'KEY_NOT_ALLOWED' : 'OK';
  }

  return judgeDeviceKeyOpen(facts);
}

export type ActivationDecisionVerdict = 'OK' | 'ALREADY_CLOSED' | 'RELEASE_NOT_APPLICABLE';

/** License release decisions apply only to open keyed activations; bundled activations carry no lot seat. */
export function judgeDecision(facts: {
  isOpen: boolean;
  isDeviceKey: boolean;
  hasLicenseRelease: boolean;
}): ActivationDecisionVerdict {
  if (!facts.isOpen) return 'ALREADY_CLOSED';
  if (!facts.isDeviceKey && facts.hasLicenseRelease) return 'RELEASE_NOT_APPLICABLE';

  return 'OK';
}

export type MoveActivationVerdict = 'OK' | 'ALREADY_CLOSED' | 'NOT_MOVABLE' | 'SAME_DEVICE' | 'KEY_WITHDRAWN';

/** Only open keyed activations backed by a non-withdrawn key may move to a different device. */
export function judgeMove(facts: {
  isOpen: boolean;
  isDeviceKey: boolean;
  sourceDeviceId: string;
  targetDeviceId: string;
  keyWithdrawn: boolean;
}): MoveActivationVerdict {
  if (!facts.isOpen) return 'ALREADY_CLOSED';
  if (!facts.isDeviceKey) return 'NOT_MOVABLE';
  if (facts.sourceDeviceId === facts.targetDeviceId) return 'SAME_DEVICE';
  if (facts.keyWithdrawn) return 'KEY_WITHDRAWN';

  return 'OK';
}
