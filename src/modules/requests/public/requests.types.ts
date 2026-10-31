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
