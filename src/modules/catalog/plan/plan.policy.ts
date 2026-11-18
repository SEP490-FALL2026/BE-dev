import { DONG } from '../../../core/money/money';
import { normalizeDisplayName } from '../../../core/display-name';
import {
  PlanControlLevelRequiredError,
  PlanDataLossNoteRequiredError,
  PlanNameInvalidError,
  PlanNoteInvalidError,
  PlanPricingModelNotApplicableError,
  PlanPricingModelNotDerivedError,
  PlanPricingModelRequiredError,
  PlanPrimaryOwnerNotListedError,
  PlanProvisioningTypeMismatchError,
  PlanProvisioningTypeNotSupportedError,
  PlanReferencePriceNotApplicableError,
  PlanReferencePriceNotVndError,
  PlanWorkspaceLimitExceededError,
  PlanWorkspaceMemberDuplicateError,
  PlanWorkspaceTextInvalidError,
} from './plan.errors';
import type { PricingModel, ProvisioningType, ReferencePrice, SeatTracking, WorkspaceRole } from './plan.types';

export const MAX_NAME_LENGTH = 200;
export const MAX_NOTE_LENGTH = 2000;

/** A plan name as it is shown: trimmed, blanks collapsed, 1 to 200 characters. */
export function cleanPlanName(raw: string): string {
  const name = normalizeDisplayName(raw);
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) throw new PlanNameInvalidError();

  return name;
}

/** A plan as a sentence names it: its application, then itself ("Figma – Professional"). */
export function applicationPlanName(applicationName: string, planName: string): string {
  return `${applicationName} – ${planName}`;
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
 * has K5 plans only and K5 belongs to no other; K1 and K2 name a pricing model, K4 may have none (it is bought once, `B-5`) and
 * K5 has none; K1, K2 and K4 name a control level; the data-loss flag needs the note that says what is lost. Throws the first one that fails.
 */
export function assertPlanShape(plan: PlanShape): void {
  if (plan.provisioningType === 'K3') throw new PlanProvisioningTypeNotSupportedError();
  if ((plan.applicationKind === 'INTERNAL') !== (plan.provisioningType === 'K5')) {
    throw new PlanProvisioningTypeMismatchError();
  }
  if (plan.provisioningType === 'K5') {
    if (plan.pricingModel !== null) throw new PlanPricingModelNotApplicableError();
  } else {
    if (plan.pricingModel === null && plan.provisioningType !== 'K4') throw new PlanPricingModelRequiredError();
    if (plan.controlLevel === null) throw new PlanControlLevelRequiredError();
  }
  if (plan.dataLossOnRemoval && plan.revocationNote === null) throw new PlanDataLossNoteRequiredError();
}

/**
 * How a plan is priced, from the kind of provisioning (`B-5`, `QĐ-111f`): the IT Admin is not asked. K1 and K2 are bought per seat; K4 is
 * bought once (the model has no value for that, and its subscriptions are perpetual purchases); K5 has no price. K3 cannot be declared yet.
 */
export function derivedPricingModel(type: ProvisioningType): PricingModel | null {
  return type === 'K1' || type === 'K2' ? 'PER_SEAT' : null;
}

/**
 * A pricing model that is sent is the one the kind of provisioning implies (`B-5`, `QĐ-111f`): the system works the model out, so the IT Admin's
 * value can only repeat it. Nothing sent is nothing to judge: a plan made before the rule keeps the model it has until its kind changes.
 * Throws PlanPricingModelNotDerivedError.
 */
export function assertPricingModelDerived(type: ProvisioningType, sent: PricingModel | null | undefined): void {
  if (sent === undefined) return;
  const expected = derivedPricingModel(type) as 'PER_SEAT' | null;
  if (sent !== expected) throw new PlanPricingModelNotDerivedError(expected);
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

/**
 * `KPI-3` of a plan priced per seat, in percent to one decimal (`QĐ-109d`): the seats with activity in the last 30 days over the seats its
 * subscriptions bought. None when nothing was bought (no ratio to give).
 */
export function kpi3Percent(activeSeats: number, purchasedSeats: number): number | null {
  if (purchasedSeats <= 0) return null;

  return Math.round((activeSeats * 1000) / purchasedSeats) / 10;
}

/**
 * The reference price of a plan (`QĐ-113a`): none is always fine; one is for a plan that is paid for (K1, K2, K4), in dong, and above zero (the
 * amount is read in the service). The kind is judged first. Throws PlanReferencePriceNotApplicableError, PlanReferencePriceNotVndError.
 */
export function assertReferencePrice(type: ProvisioningType, price: ReferencePrice | null): void {
  if (price === null) return;
  assertReferencePriceKind(type);
  if (price.currency !== DONG) throw new PlanReferencePriceNotVndError(price.currency);
}

/** Only a plan that is paid for (K1, K2, K4) can have a reference price. Throws PlanReferencePriceNotApplicableError. */
export function assertReferencePriceKind(type: ProvisioningType): void {
  if (type !== 'K1' && type !== 'K2' && type !== 'K4') throw new PlanReferencePriceNotApplicableError();
}

/**
 * What the reference price becomes when the kind of the plan changes (`QĐ-113a`): a K5 plan has none; between a per-seat kind (K1, K2: the price
 * of a seat for a month) and K4 (the price of one purchase) the number means another thing, so the IT Admin enters it again. The price cleared is in
 * the audit of the change (its before and after).
 */
export function referencePriceOnKindChange(from: ProvisioningType, to: ProvisioningType): 'KEEP' | 'CLEAR' {
  if (from === to) return 'KEEP';
  if (to === 'K5' || to === 'K3') return 'CLEAR';

  return (from === 'K4') !== (to === 'K4') ? 'CLEAR' : 'KEEP';
}

/** Whether the quote of an assessment may become the reference price of the plan the request is linked to (`QĐ-113a`): a K1 or K2 plan that has none; a K4 plan is priced by the IT Admin. */
export function canAdoptQuotePrice(type: ProvisioningType, current: ReferencePrice | null): boolean {
  return (type === 'K1' || type === 'K2') && current === null;
}
