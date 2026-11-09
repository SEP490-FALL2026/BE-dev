/** A request a person is the beneficiary of that is not over, as the IT Admin sees it beside the record of their departure (`US-03-04` AC-24). */
export interface OpenRequestOfBeneficiary {
  requestId: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'RENEWAL' | 'GROUP_GRANT';
  state: string;
  /** The plan asked for; null for software that is not in the catalog yet. */
  plan: { planId: string; planName: string; applicationId: string; applicationName: string } | null;
  requester: { employeeId: string; employeeCode: string; fullName: string };
  submittedAt: Date;
  /** The request is for a group of people: the line of this person is the open part of it, and closing that line leaves the request for the others. */
  group: boolean;
  /** The IT Admin may close it now: the person has left (their line only, when the request is for a group). */
  cancellable: boolean;
}

/** The longest reason a step of the summary source carries, in characters (code points): what the summary may read of it (`US-15-05`). */
export const AI_SOURCE_REASON_LENGTH = 1000;

/**
 * A step a person has to decide now, as the summary of their queue reads it (`US-15-05`): a need step or a spend step that is open and
 * given to them, by the same rules as the two queues they read by hand. It carries no deadline, no holder and no figure of a budget.
 */
export interface AiSourceStep {
  stepId: string;
  requestId: string;
  stepKind: 'NEED_APPROVAL' | 'SPEND_APPROVAL';
  /** When the step was given to the person; the steps are read in this order. */
  assignedAt: Date;
  /** The name of new software proposed, else the application of the plan asked for. */
  softwareName: string;
  /** The full name of the one person the request is for; a request for a group reads "Nhóm <n> người", n the people on the step. */
  beneficiaryDisplayName: string;
  /** The whole business reason, cut to its first `AI_SOURCE_REASON_LENGTH` characters. */
  reason: string;
  termMonths: number | null;
  /** What the request is priced at, as the queue of the approver writes it; only on a spend step, and null while it is not priced. */
  estimatedCost: { amount: string; currency: string } | null;
}
