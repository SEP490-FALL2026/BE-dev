import { formatAmount } from '../../../core/money/money';
import type { WorkspaceDuty } from '../public/catalog.types';
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
    referenceCommitmentMonths: plan.referenceCommitmentMonths,
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
  referenceCommitmentMonths: plan.referenceCommitmentMonths,
});

export interface WorkspaceDutyRow {
  workspace_id: string;
  workspace_name: string;
  vendor_id: string;
  primary_owner_employee_id: string | null;
  responsible_it_admin_employee_id: string | null;
  emergency_account_declared: boolean;
  members: ReadonlyArray<{ employeeId: string; role: 'OWNER' | 'ADMIN' }>;
  plan_id: string;
  plan_name: string;
  application_name: string;
}

/** Maps one workspace row returned by `PlanRepo.findWorkspaceDuties` into `WorkspaceDuty` items for matching `ids`. */
export function mapWorkspaceDutyRow(row: WorkspaceDutyRow, ids: readonly string[]): WorkspaceDuty[] {
  const named = {
    planId: row.plan_id,
    planName: row.plan_name,
    applicationName: row.application_name,
    emergencyAccountDeclared: row.emergency_account_declared,
    workspace: {
      id: row.workspace_id,
      name: row.workspace_name,
      vendorId: row.vendor_id,
      responsibleItAdminEmployeeId: row.responsible_it_admin_employee_id,
      members: row.members,
    },
  };
  const owner =
    row.primary_owner_employee_id && ids.includes(row.primary_owner_employee_id) ? row.primary_owner_employee_id : null;
  const members = row.members.filter((member) => ids.includes(member.employeeId) && member.employeeId !== owner);

  return [
    ...(owner ? [{ ...named, employeeId: owner, role: 'PRIMARY_OWNER' as const }] : []),
    ...members.map((member) => ({ ...named, employeeId: member.employeeId, role: member.role })),
  ];
}
