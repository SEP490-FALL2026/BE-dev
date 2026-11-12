import { CURRENT_POLICY_VERSION, type RequestPolicy } from '../access-request/access-request.policy';
import type { AccessRequestState } from '../access-request/access-request.types';
import type { AssessmentFields } from '../access-request/assessment-record.types';

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
  | { kind: 'UNCONTROLLABLE' };

const REQUIRED_FLAGS = ['adminConsole', 'memberExport', 'sso'] as const;

/**
 * What the assessment of paid or licensed software still lacks, in the order a screen shows it (`US-05-06` AC-3): the
 * minimum of `QĐ-22`, the control level, the quote that gives the request its amount and, for data that is highly
 * sensitive, the opinion that was obtained or the reason there is none (`OI-05a`: an opinion that is missing does not
 * stop the request, but the IT Admin says so).
 */
export function missingFields(fields: AssessmentFields): string[] {
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

export function judgeCompletion(fields: AssessmentFields): CompletionVerdict {
  if (fields.classification === null) return { kind: 'INCOMPLETE', missing: ['classification'] };
  if (fields.classification === 'INTERNAL') return { kind: 'INTERNAL_BY_REGISTRATION' };
  if (fields.controlLevel === 'UNCONTROLLABLE') return { kind: 'UNCONTROLLABLE' };
  const missing = missingFields(fields);

  return missing.length > 0 ? { kind: 'INCOMPLETE', missing } : { kind: 'OK' };
}

export type AssessorRefusal = 'OWN_REQUEST' | 'NOT_AWAITING_ASSESSMENT';

/**
 * Whether the person may fill or complete the assessment of this request now. The route already limits it to IT Admins;
 * here an IT Admin may not assess a request they asked for or are given (`SoD-4`), and only while the request waits for
 * the assessment: once it is completed it is not changed (`FR-11.2`).
 */
export function checkAssessor(facts: {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  requestState: AccessRequestState;
}): AssessorRefusal | null {
  if (
    facts.actorEmployeeId === facts.requesterEmployeeId ||
    facts.beneficiaryEmployeeIds.includes(facts.actorEmployeeId)
  ) {
    return 'OWN_REQUEST';
  }

  return facts.requestState === 'AWAITING_IT_ASSESSMENT' ? null : 'NOT_AWAITING_ASSESSMENT';
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
):
  | { kind: 'NOT_INTERNAL' }
  | { kind: 'DATA_SENSITIVITY_MISSING' }
  | { kind: 'OK'; dataSensitivity: NonNullable<AssessmentFields['dataSensitivity']> } {
  if (assessment.classification !== 'INTERNAL') return { kind: 'NOT_INTERNAL' };
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
