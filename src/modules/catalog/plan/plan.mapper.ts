import { seatTrackingOf } from './plan.policy';
import type { PlanRecord, PlanSummaryRecord } from './plan.types';

/** A row of the plan list as it is answered. */
export function toPlanSummaryWire(plan: PlanSummaryRecord) {
  return {
    id: plan.id,
    applicationId: plan.applicationId,
    applicationName: plan.applicationName,
    applicationLogoUrl: plan.applicationLogoUrl,
    name: plan.name,
    provisioningType: plan.provisioningType,
    pricingModel: plan.pricingModel,
    controlLevel: plan.controlLevel,
    dataLossOnRemoval: plan.dataLossOnRemoval,
    sharingPolicy: plan.sharingPolicy,
    hasAdminConsole: plan.hasAdminConsole,
    seatTracking: seatTrackingOf(plan.pricingModel),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

/** A plan as a detail or a write answers it: the summary and the revocation note. */
export function toPlanWire(plan: PlanRecord) {
  return { ...toPlanSummaryWire(plan), revocationNote: plan.revocationNote };
}
