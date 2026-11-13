import type { BusinessDate } from '../../../core/business-date';

/** A personal seat the departure takes away. */
export interface RightToRevoke {
  assignmentId: string;
  application: { id: string; name: string };
  plan: { id: string; name: string };
  provisioningType: string;
  /** A task can take the seat away (K1, K2, K4, K5); K3 has no revocation yet. */
  revocable: boolean;
  dataLossOnRemoval: boolean;
  revocationNote: string | null;
  /** A task of the queue already works on taking it away. */
  revocationUnderWay: boolean;
}

/** A request of the person that is open: the system closes it, or leaves it to the IT Admin when a grant is being carried out. */
export interface OpenRequestImpact {
  requestId: string;
  type: string;
  state: string;
  /** The request is for a group: only the line of this person ends. */
  line: boolean;
}

/** What goes back to the budget in one currency, in the smallest unit as a string. */
export interface CommitmentToRelease {
  currency: string;
  amountMinor: string;
}

/**
 * What a departure does to a person, read and never written (`P23`, `MIN-7`). The record of the departure and the preview share it.
 * `responsibilities` is what an IT Admin who leaves answers for in the catalog (0 and 0 for anyone else); `vendorAdminRoles` is empty until it is counted.
 */
export interface DepartureImpact {
  rightsToRevoke: RightToRevoke[];
  /** The requests the system closes when the access is blocked, each with the commitment it holds given back. */
  openRequestsToCancel: OpenRequestImpact[];
  /** The requests with a grant being carried out: not closed, the IT Admin in charge is told to check the vendor and close them. */
  provisioningInFlight: OpenRequestImpact[];
  /** What is held and not spent for the requests that are closed, by currency (the share of a group line is not in it). */
  commitmentToRelease: CommitmentToRelease[];
  responsibilities: { subscriptions: number; applications: number };
  vendorAdminRoles: string[];
  headSuccessorRequired: boolean;
  /** The day the IT Admin has until to take every right away. */
  revocationDueOn: BusinessDate;
}

/** What the impact of a departure is read from: the facts the caller already judged. */
export interface DepartureImpactInput {
  employeeId: string;
  today: BusinessDate;
  /** The last working day: today for a departure blocked now. */
  lastWorkingDay: BusinessDate;
  /** The person heads the department on their last day in office (the caller judged it, so a preview needs no write path). */
  headSuccessorRequired: boolean;
}
