import { normalizeDisplayName } from '../../../core/display-name';
import {
  PlanControlLevelRequiredError,
  PlanDataLossNoteRequiredError,
  PlanNameInvalidError,
  PlanNoteInvalidError,
  PlanPricingModelNotApplicableError,
  PlanPricingModelRequiredError,
  PlanPrimaryOwnerNotListedError,
  PlanProvisioningTypeMismatchError,
  PlanProvisioningTypeNotSupportedError,
  PlanWorkspaceLimitExceededError,
  PlanWorkspaceMemberDuplicateError,
  PlanWorkspaceTextInvalidError,
} from './plan.errors';
import type { PricingModel, ProvisioningType, SeatTracking, WorkspaceRole } from './plan.types';

export const MAX_NAME_LENGTH = 200;
export const MAX_NOTE_LENGTH = 2000;

/** A plan name as it is shown: trimmed, blanks collapsed, 1 to 200 characters. */
export function cleanPlanName(raw: string): string {
  const name = normalizeDisplayName(raw);
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) throw new PlanNameInvalidError();

  return name;
}

/** The note on what is lost when a user is removed: nothing or blanks is null; at most 2000 characters. */
export function cleanRevocationNote(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const note = normalizeDisplayName(raw);
  if (note.length > MAX_NOTE_LENGTH) throw new PlanNoteInvalidError();

  return note === '' ? null : note;
}

/** A free-text field of the workspace profile: nothing or blanks is null; at most 2000 characters. */
export function cleanWorkspaceText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const text = normalizeDisplayName(raw);
  if (text.length > MAX_NOTE_LENGTH) throw new PlanWorkspaceTextInvalidError();

  return text === '' ? null : text;
}

export interface PlanShape {
  applicationKind: 'SAAS' | 'LICENSED' | 'INTERNAL';
  provisioningType: ProvisioningType;
  pricingModel: PricingModel | null;
  controlLevel: string | null;
  dataLossOnRemoval: boolean;
  revocationNote: string | null;
}

/**
 * The rules a plan must meet whatever its fields are, in a fixed order: K3 is not declarable yet; an internal application
 * has K5 plans only and K5 belongs to no other; K1, K2 and K4 name a pricing model and K5 has none; K1, K2 and K4 name a
 * control level; the data-loss flag needs the note that says what is lost. Throws the first one that fails.
 */
export function assertPlanShape(plan: PlanShape): void {
  if (plan.provisioningType === 'K3') throw new PlanProvisioningTypeNotSupportedError();
  if ((plan.applicationKind === 'INTERNAL') !== (plan.provisioningType === 'K5')) {
    throw new PlanProvisioningTypeMismatchError();
  }
  if (plan.provisioningType === 'K5') {
    if (plan.pricingModel !== null) throw new PlanPricingModelNotApplicableError();
  } else {
    if (plan.pricingModel === null) throw new PlanPricingModelRequiredError();
    if (plan.controlLevel === null) throw new PlanControlLevelRequiredError();
  }
  if (plan.dataLossOnRemoval && plan.revocationNote === null) throw new PlanDataLossNoteRequiredError();
}

/** Seats are counted only for a per-seat plan; any other plan shows them as not applicable, never as zero (`BR-06.4`). */
export function seatTrackingOf(pricingModel: PricingModel | null): SeatTracking {
  return pricingModel === 'PER_SEAT' ? 'APPLICABLE' : 'NOT_APPLICABLE';
}

export interface WorkspaceShape {
  primaryOwnerEmployeeId: string;
  members: ReadonlyArray<{ employeeId: string; role: WorkspaceRole }>;
  ownerLimit: number | null;
  adminLimit: number | null;
}

/**
 * The rules inside a workspace profile: a person is listed once, the primary owner is listed as an owner, and the number
 * of owners and of admins stays within the limits the vendor sets.
 */
export function assertWorkspaceShape(profile: WorkspaceShape): void {
  const seen = new Set<string>();
  for (const member of profile.members) {
    if (seen.has(member.employeeId)) throw new PlanWorkspaceMemberDuplicateError(member.employeeId);
    seen.add(member.employeeId);
  }
  const primary = profile.members.find((member) => member.employeeId === profile.primaryOwnerEmployeeId);
  if (!primary || primary.role !== 'OWNER') throw new PlanPrimaryOwnerNotListedError();

  const owners = profile.members.filter((member) => member.role === 'OWNER').length;
  const admins = profile.members.length - owners;
  if (profile.ownerLimit !== null && owners > profile.ownerLimit) throw new PlanWorkspaceLimitExceededError('OWNER');
  if (profile.adminLimit !== null && admins > profile.adminLimit) throw new PlanWorkspaceLimitExceededError('ADMIN');
}
