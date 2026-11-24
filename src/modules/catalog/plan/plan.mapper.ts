import { formatAmount } from '../../../core/money/money';
import { seatTrackingOf } from './plan.policy';
import type { PlanRecord, PlanSummaryRecord, ReferencePrice } from './plan.types';

/** Dong has no minor digits (`currencies`: VND, 0); the table keeps no other currency for a reference price. */
const DONG_MINOR_DIGITS = 0;

const referencePriceWire = (price: ReferencePrice | null) =>
  price && { amount: formatAmount(price.amountMinor, DONG_MINOR_DIGITS), currency: price.currency };

/** A row of the plan list as it is answered. */
export function toPlanSummaryWire(plan: PlanSummaryRecord) {
  return {
    id: plan.id,
    applicationId: plan.applicationId,
    applicationName: plan.applicationName,
    applicationLogoUrl: plan.applicationLogoUrl,
    name: plan.name,
    provisioningType: plan.provisioningType,
    keyBinding: plan.keyBinding,
    pricingModel: plan.pricingModel,
    controlLevel: plan.controlLevel,
    dataLossOnRemoval: plan.dataLossOnRemoval,
    sharingPolicy: plan.sharingPolicy,
    hasAdminConsole: plan.hasAdminConsole,
    referencePrice: referencePriceWire(plan.referencePrice),
    seatTracking: seatTrackingOf(plan.pricingModel),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

/** A plan as a detail or a write answers it: the summary and the revocation note. */
export function toPlanWire(plan: PlanRecord) {
  return { ...toPlanSummaryWire(plan), revocationNote: plan.revocationNote };
}

/** The plan as the audit keeps it (before and after of `PLAN.CREATED`/`PLAN.UPDATED`). */
export const planAuditSnapshot = (plan: PlanRecord) => ({
  applicationId: plan.applicationId,
  name: plan.name,
  provisioningType: plan.provisioningType,
  keyBinding: plan.keyBinding,
  pricingModel: plan.pricingModel,
  controlLevel: plan.controlLevel,
  revocationNote: plan.revocationNote,
  dataLossOnRemoval: plan.dataLossOnRemoval,
  sharingPolicy: plan.sharingPolicy,
  hasAdminConsole: plan.hasAdminConsole,
  // Minor units of dong as text: the audit keeps no number that could lose digits (ADR-0007).
  referencePrice: plan.referencePrice && {
    amountMinor: plan.referencePrice.amountMinor.toString(),
    currency: plan.referencePrice.currency,
  },
});
