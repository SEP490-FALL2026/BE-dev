import { CURRENT_POLICY_VERSION, type RequestPolicy } from '../access-request/access-request.policy';
import type { AccessRequestState } from '../access-request/access-request.types';
import type { Money } from '../../../core/money/money';
import type { AssessmentFields, Quote } from '../access-request/assessment-record.types';
import { roundHalfAway } from '../../../core/seat-month-cost';

/**
 * The rules of the assessment the IT Admin completes for software that is not in the catalog (`US-05-06`, `BM-02`), as
 * pure decisions: who may fill it and when, and when it is complete. Nothing here puts the software into the catalog or
 * decides the spend: the IT Admin gives the assessment and only the spending approver decides (`QĐ-22`, `SoD-5`).
 */

/** The first thing that stops the assessment from being completed, or `OK`. */
export type CompletionVerdict =
  | { kind: 'OK' }
  | { kind: 'INCOMPLETE'; missing: string[] }
  /** Internal software is completed by registering it in the catalog (`US-05-20`), not here. */
  | { kind: 'INTERNAL_BY_REGISTRATION' }
  /** A tool that cannot be controlled is refused at the gate with a reason (`US-05-18` AC-1), not sent on. */
  | { kind: 'UNCONTROLLABLE' }
  /** A plan of internal software costs nothing: it has no quote and no spending approver (`QĐ-111d`, `QĐ-103p`), so a short proposal for it is rejected, not completed. */
  | { kind: 'FREE_PLAN' };

const REQUIRED_FLAGS = ['adminConsole', 'memberExport', 'sso'] as const;

/**
 * What the IT Admin assesses: the software with its plan, or the plan alone when the proposal names an application the catalog already has
 * (case B, short: `QĐ-111a`, the IT Admin does not assess the application again).
 */
export type AssessmentScope = 'FULL' | 'PLAN_ONLY';

export const assessmentScopeOf = (proposal: { existingApplicationId: string | null }): AssessmentScope =>
  proposal.existingApplicationId === null ? 'FULL' : 'PLAN_ONLY';

/**
 * What the assessment of a plan alone still lacks (`QĐ-111a`: terms, price, kind of provisioning; R-53: whether a K4 plan has an admin console of
 * the vendor): nothing of the application, which the catalog already holds.
 */
function missingPlanFields(fields: AssessmentFields): string[] {
  const missing: string[] = [];
  if (fields.plannedPlanName === null) missing.push('plannedPlanName');
  if (fields.provisioningType === null) missing.push('provisioningType');
  if (fields.provisioningType === 'K4' && fields.adminConsole === null) missing.push('adminConsole');
  if (fields.termsSummary === null) missing.push('termsSummary');
  if (fields.quote === null) missing.push('quote');

  return missing;
}

/**
 * What the assessment of paid or licensed software still lacks, in the order a screen shows it (`US-05-06` AC-3): the
 * minimum of `QĐ-22`, the control level, the quote that gives the request its amount and, for data that is highly
 * sensitive, the opinion that was obtained or the reason there is none (`OI-05a`: an opinion that is missing does not
 * stop the request, but the IT Admin says so).
 */
export function missingFields(fields: AssessmentFields, scope: AssessmentScope = 'FULL'): string[] {
  return scope === 'PLAN_ONLY' ? missingPlanFields(fields) : missingFullFields(fields);
}

function missingFullFields(fields: AssessmentFields): string[] {
  const missing: string[] = [];
  const text = (
    name: 'vendorName' | 'plannedPlanName' | 'termsSummary' | 'memberUsageMethod' | 'grantRevokeMethod',
  ) => {
    if (fields[name] === null) missing.push(name);
  };
  text('vendorName');
  text('plannedPlanName');
  if (fields.provisioningType === null) missing.push('provisioningType');
  for (const name of REQUIRED_FLAGS) if (fields[name] === null) missing.push(name);
  text('termsSummary');
  text('memberUsageMethod');
  text('grantRevokeMethod');
  if (fields.dataSensitivity === null) missing.push('dataSensitivity');
  if (fields.dataSensitivity === 'HIGH') {
    if (fields.opinionStatus === null) missing.push('opinion.status');
    else if (fields.opinionStatus === 'NOT_AVAILABLE' && fields.opinionNote === null) missing.push('opinion.note');
  }
  if (fields.controlLevel === null) missing.push('controlLevel');
  if (fields.quote === null) missing.push('quote');

  return missing;
}

/**
 * What completing the assessment would do. `internalApplication` is whether the application a short proposal names is internal software: all its
 * plans are `K5` and free (the catalog keeps one for the other), and a short proposal always ends paid (`D-38`), so nothing the IT Admin fills
 * lets it be completed and it is told so first (`QĐ-111d`, `QĐ-103p`, `QĐ-50a`). It says nothing of a whole assessment, where internal software is `classification`.
 */
export function judgeCompletion(
  fields: AssessmentFields,
  scope: AssessmentScope = 'FULL',
  internalApplication = false,
): CompletionVerdict {
  if (scope === 'PLAN_ONLY') {
    if (internalApplication) return { kind: 'FREE_PLAN' };
    if (fields.controlLevel === 'UNCONTROLLABLE') return { kind: 'UNCONTROLLABLE' };
    const missing = missingPlanFields(fields);

    return missing.length > 0 ? { kind: 'INCOMPLETE', missing } : { kind: 'OK' };
  }
  if (fields.classification === null) return { kind: 'INCOMPLETE', missing: ['classification'] };
  if (fields.classification === 'INTERNAL') return { kind: 'INTERNAL_BY_REGISTRATION' };
  if (fields.controlLevel === 'UNCONTROLLABLE') return { kind: 'UNCONTROLLABLE' };
  const missing = missingFields(fields);

  return missing.length > 0 ? { kind: 'INCOMPLETE', missing } : { kind: 'OK' };
}

export type AssessorRefusal = 'OWN_REQUEST' | 'NOT_AWAITING_ASSESSMENT' | 'ASSESSMENT_NOT_IN_CHARGE';

/**
 * Whether the person may fill or complete the assessment of this request now. An IT Admin may not assess a request
 * they asked for or are given, only while the request waits for the assessment, and only when they are currently
 * acting for the requester’s department.
 */
export function checkAssessor(facts: {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  requestState: AccessRequestState;
  actingItAdminIds: readonly string[];
}): AssessorRefusal | null {
  if (
    facts.actorEmployeeId === facts.requesterEmployeeId ||
    facts.beneficiaryEmployeeIds.includes(facts.actorEmployeeId)
  ) {
    return 'OWN_REQUEST';
  }
  if (facts.requestState !== 'AWAITING_IT_ASSESSMENT') return 'NOT_AWAITING_ASSESSMENT';
  if (!facts.actingItAdminIds.includes(facts.actorEmployeeId)) return 'ASSESSMENT_NOT_IN_CHARGE';

  return null;
}

/**
 * Whether the request may now be linked to the plan registered in the catalog (`US-05-06` AC-4, AC-8): only after the
 * spending approver has decided it, which is the state that waits for the grant. Before then the IT Admin has no way to
 * put the software of a request into the catalog.
 */
export const canLinkCatalogPlan = (facts: {
  branch: string;
  state: AccessRequestState;
  planId: string | null;
}): boolean => facts.branch === 'NEW_SOFTWARE' && facts.state === 'AWAITING_EXECUTION' && facts.planId === null;

/** Whether the person works the assessment in the place of the one the step was given to: any step that is not their own. */
export function actsForAssignee(step: { assigneeEmployeeId: string | null } | null, actorEmployeeId: string): boolean {
  return step !== null && step.assigneeEmployeeId !== actorEmployeeId;
}

/**
 * What registering internal software for a proposal rests on (`US-05-20` AC-3 -> AC-5, AC-8): only software the company built itself
 * goes this way, whatever else it is stays in the third branch (`AC-8`), and how sensitive its data is must be said, by the body or by
 * the assessment. Classification is judged first.
 */
export function internalRegistrationBasis(
  assessment: Pick<AssessmentFields, 'classification' | 'dataSensitivity'>,
  given: AssessmentFields['dataSensitivity'] | undefined,
  scope: AssessmentScope = 'FULL',
):
  | { kind: 'NOT_INTERNAL' }
  | { kind: 'DATA_SENSITIVITY_MISSING' }
  | { kind: 'OK'; dataSensitivity: NonNullable<AssessmentFields['dataSensitivity']> } {
  // A short proposal is for a plan of an application already in the catalog: registering a new application for it would be a duplicate.
  if (scope === 'PLAN_ONLY' || assessment.classification !== 'INTERNAL') return { kind: 'NOT_INTERNAL' };
  const dataSensitivity = given ?? assessment.dataSensitivity;

  return dataSensitivity === null ? { kind: 'DATA_SENSITIVITY_MISSING' } : { kind: 'OK', dataSensitivity };
}

/**
 * The branch, the chain and the state the request takes once its software is registered: with a payment the chain stays as it was sent
 * and the request waits to be submitted for spend; with none the spend step is dropped and the IT Admin grants it by hand (`AC-1`, `AC-10`).
 */
export function registeredShapeOf(
  withSpend: boolean,
  sent: RequestPolicy,
): {
  branch: 'NEW_SOFTWARE' | 'INTERNAL_FREE';
  policy: RequestPolicy;
  state: 'AWAITING_SPEND_SUBMISSION' | 'AWAITING_EXECUTION';
} {
  if (withSpend) return { branch: 'NEW_SOFTWARE', policy: sent, state: 'AWAITING_SPEND_SUBMISSION' };

  return {
    branch: 'INTERNAL_FREE',
    policy: {
      version: CURRENT_POLICY_VERSION,
      branch: 'INTERNAL_FREE',
      chain: sent.chain.includes('NEED')
        ? ['NEED', 'IT_ASSESSMENT', 'IT_EXECUTION']
        : ['IT_ASSESSMENT', 'IT_EXECUTION'],
      slaWorkingDays: sent.slaWorkingDays,
    },
    state: 'AWAITING_EXECUTION',
  };
}

const QUOTE_CYCLE_MONTHS: Readonly<Record<Exclude<Quote['billingCycle'], 'OTHER'>, bigint>> = {
  MONTHLY: 1n,
  QUARTERLY: 3n,
  ANNUAL: 12n,
};

export function monthlyPriceOfQuote(quote: Pick<Quote, 'unitPrice' | 'billingCycle'>): Money {
  return {
    amountMinor: roundHalfAway(quote.unitPrice.amountMinor, QUOTE_CYCLE_MONTHS[quote.billingCycle]),
    currency: quote.unitPrice.currency,
  };
}
