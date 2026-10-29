import type { AccessRequestState } from '../access-request/access-request.types';
import type { Quote } from './quote-pricing.policy';

/**
 * The rules of the assessment the IT Admin completes for software that is not in the catalog (`US-05-06`, `BM-02`), as
 * pure decisions: who may fill it and when, and when it is complete. Nothing here puts the software into the catalog or
 * decides the spend: the IT Admin gives the assessment and only the spending approver decides (`QĐ-22`, `SoD-5`).
 */

export type Classification = 'INTERNAL' | 'PAID_LICENSED';
export type ControlLevelCode = 'FULL' | 'PARTIAL' | 'UNCONTROLLABLE';
export type SensitivityCode = 'LOW' | 'MEDIUM' | 'HIGH';
export type OpinionStatusCode = 'OBTAINED' | 'NOT_AVAILABLE';

/** The fields of the assessment as the IT Admin has filled them so far; anything not given is null. */
export interface AssessmentFields {
  classification: Classification | null;
  vendorName: string | null;
  plannedPlanName: string | null;
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | null;
  adminConsole: boolean | null;
  memberExport: boolean | null;
  sso: boolean | null;
  termsSummary: string | null;
  memberUsageMethod: string | null;
  grantRevokeMethod: string | null;
  dataSensitivity: SensitivityCode | null;
  opinionStatus: OpinionStatusCode | null;
  opinionNote: string | null;
  controlLevel: ControlLevelCode | null;
  quote: Quote | null;
}

/** The first thing that stops the assessment from being completed, or `OK`. */
export type CompletionVerdict =
  | { kind: 'OK' }
  | { kind: 'INCOMPLETE'; missing: string[] }
  /** Internal software is completed by registering it in the catalog with its Business Owner (`US-05-20`), not here. */
  | { kind: 'INTERNAL_BY_REGISTRATION' }
  /** A tool that cannot be controlled is refused at the gate with a reason (`US-05-18` AC-1), not sent on. */
  | { kind: 'UNCONTROLLABLE' };

const REQUIRED_FLAGS = ['adminConsole', 'memberExport', 'sso'] as const;

/**
 * What the assessment of paid or licensed software still lacks, in the order a screen shows it (`US-05-06` AC-3): the
 * minimum of `QĐ-22`, the control level, the quote that gives the request its amount and, for data that is highly
 * sensitive, the opinion of the Business Owner or the reason there is none (`OI-05a`: an opinion that is missing does not
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
