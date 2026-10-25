/**
 * The branch and the chain of step kinds of a request, and the SLA of its steps, fixed when it is sent (`US-05-02`
 * AC-3, AC-9). Paid or licensed software that is already in the catalog always has a spend step, whatever the seats left
 * on its subscription (`QĐ-82m` C); internal software with no fee never has one (`QĐ-50a`).
 */

/** The kinds of application the catalog holds (`QĐ-49a`). */
export type ApplicationKind = 'SAAS' | 'LICENSED' | 'INTERNAL';

export type AccessRequestBranchCode = 'INTERNAL_FREE' | 'PAID_IN_CATALOG' | 'NEW_SOFTWARE';

/** A link of the chain of a request. `IT_EXECUTION` is the task of the IT Admin, not an approval step. */
export type ChainStep = 'NEED' | 'IT_ASSESSMENT' | 'SPEND_APPROVAL' | 'IT_EXECUTION';

/** The version of the rules of this policy; a request keeps the version it was sent under. */
export const CURRENT_POLICY_VERSION = 1;

export interface RequestPolicy {
  version: number;
  branch: AccessRequestBranchCode;
  chain: ChainStep[];
  /** Working days a step may wait, as the parameter was at the time of sending. */
  slaWorkingDays: number;
}

/** The policy of a request for a plan of an application of this kind, with the SLA in force now. A fresh value each time. */
export function policyFor(kind: ApplicationKind, slaWorkingDays: number): RequestPolicy {
  return kind === 'INTERNAL'
    ? { version: CURRENT_POLICY_VERSION, branch: 'INTERNAL_FREE', chain: ['NEED', 'IT_EXECUTION'], slaWorkingDays }
    : {
        version: CURRENT_POLICY_VERSION,
        branch: 'PAID_IN_CATALOG',
        chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
        slaWorkingDays,
      };
}

/**
 * The policy of a proposal of software that is not in the catalog (`US-05-02` AC-8): the need, the assessment of the IT
 * Admin, the spend decision, then the grant. It has a spend step always: the only way out of it that skips the spend is
 * the rejection of the assessment or the registration of internal software, which end or change the request.
 */
export function proposalPolicy(slaWorkingDays: number): RequestPolicy {
  return {
    version: CURRENT_POLICY_VERSION,
    branch: 'NEW_SOFTWARE',
    chain: ['NEED', 'IT_ASSESSMENT', 'SPEND_APPROVAL', 'IT_EXECUTION'],
    slaWorkingDays,
  };
}

/** Whether the chain has a spend step: only then can one person hold both the need step and the spend step. */
export const hasSpendStep = (policy: Pick<RequestPolicy, 'chain'>): boolean => policy.chain.includes('SPEND_APPROVAL');

/** Who is asking and which roles they hold now. */
export interface ViewingActor {
  employeeId: string;
  roles: readonly string[];
}

/**
 * Who may see a request: the person who sent it, the people it is for, the person who holds its need step and an IT Admin
 * (`BM-01`: requester, people who decide, IT Admin). A Super Admin files and decides no business record (`SoD-1`), and
 * nobody else sees a request they have no part in.
 */
export function canViewRequest(actor: ViewingActor, request: ViewFacts): boolean {
  return (
    actor.employeeId === request.requesterEmployeeId ||
    request.beneficiaryEmployeeIds.includes(actor.employeeId) ||
    actor.employeeId === request.needStepAssigneeEmployeeId ||
    (request.needStepAssigneeEmployeeIds ?? []).includes(actor.employeeId) ||
    actor.roles.includes('IT_ADMIN')
  );
}

/** What decides who may see a request. */
export interface ViewFacts {
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  needStepAssigneeEmployeeId: string | null;
  /** Every need step of a request for a group, which has more than one holder; absent for any other request. */
  needStepAssigneeEmployeeIds?: readonly (string | null)[];
}

/** The facts of a request that decide who sees it, read from the request as the repository returns it. */
export const viewFactsOf = (request: {
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  needStep: { assigneeEmployeeId: string | null };
  needSteps: readonly { assigneeEmployeeId: string | null }[];
}): ViewFacts => ({
  requesterEmployeeId: request.requesterEmployeeId,
  beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
  needStepAssigneeEmployeeId: request.needStep.assigneeEmployeeId,
  needStepAssigneeEmployeeIds: request.needSteps.map((step) => step.assigneeEmployeeId),
});
