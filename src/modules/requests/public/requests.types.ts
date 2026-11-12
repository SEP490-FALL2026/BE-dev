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

/**
 * Which requests of a person who is gone the system closes (`QĐ-110d`, `QĐ-110o`):
 * - `ALL_OPEN` (MF-2, the day access is blocked): every open request of the person, whatever it asks for and costs;
 * - `PAID_OLD_DEPARTMENT` (MF-3, the day the transfer takes effect): only the paid requests (`GRANT`, `RENEWAL`, a group) sent from the
 *   department the person left.
 */
export type BeneficiaryGoneScope = { kind: 'ALL_OPEN' } | { kind: 'PAID_OLD_DEPARTMENT'; oldDepartmentId: string };

export interface BeneficiaryGoneInput {
  /** The person who left or was moved. */
  employeeId: string;
  scope: BeneficiaryGoneScope;
  now?: Date;
}

/** A request, or the line of the person in a request for a group, that the system dealt with. */
export interface BeneficiaryGoneItem {
  requestId: string;
  /** The line of the person in a request for a group, which is all that ends of it. */
  line: boolean;
}

/**
 * What the system did to the open requests of the person. `cancelled` ended as cancelled (what was held for them went back to the budget,
 * the requester and Finance are told). `needsItCheck` were not touched: the grant is being carried out, so the IT Admin checks the vendor
 * and closes them by hand, and was told in the inbox. Whatever else the person has open is out of the scope and appears nowhere.
 */
export interface BeneficiaryGoneResult {
  cancelled: BeneficiaryGoneItem[];
  needsItCheck: BeneficiaryGoneItem[];
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
