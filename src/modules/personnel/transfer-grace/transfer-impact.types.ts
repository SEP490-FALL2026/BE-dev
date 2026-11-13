import type { BusinessDate } from '../../../core/business-date';
import type {
  CommitmentToRelease,
  OpenRequestImpact,
  RightToRevoke,
} from '../departure-deadline/departure-impact.types';

/**
 * What a transfer does to a person, read and never written (`P23`, `MIN-7`, `QĐ-110n`, `QĐ-110o`, `QĐ-110p`). The record of the transfer
 * (`P6`) and the preview before it share it, as the departure does (`DepartureImpact`); the shape is the same so the screen reads both
 * alike, with the day the grace ends in place of the day the revocations are due.
 *
 * `responsibilities` is what an IT Admin who is moved answers for in the catalog (subscriptions and applications, `R-8`). `vendorAdminRoles` lists the plans they administer at the vendor (`QĐ-110k`). Not yet counted: the
 * commitment that the seats of the old department give back the day the
 * transfer takes effect (MF3-B.3 adds it to `commitmentToRelease`).
 */
export interface TransferImpact {
  /** Every personal right the person holds: the system opens its revocation when the grace ends (`QĐ-110p`), except one granted again meanwhile. */
  rightsToRevoke: RightToRevoke[];
  /** The paid requests sent from the old department that the system closes the day the transfer takes effect (`QĐ-110o`). */
  openRequestsToCancel: OpenRequestImpact[];
  /** The requests with a grant being carried out: not closed, the IT Admin in charge is told to check the vendor and close them. */
  provisioningInFlight: OpenRequestImpact[];
  /** What is held and not spent for the requests that are closed, by currency (the share of a group line is not in it). */
  commitmentToRelease: CommitmentToRelease[];
  responsibilities: { subscriptions: number; applications: number };
  vendorAdminRoles: string[];
  headSuccessorRequired: boolean;
  /** The last day the person keeps the rights of the old department. */
  graceEndsOn: BusinessDate;
  /** The day the person is told once more that the rights are about to be taken back. */
  graceReminderOn: BusinessDate;
}

/** What the impact of a transfer is read from: the facts the caller already judged. */
export interface TransferImpactInput {
  employeeId: string;
  /** The department the person leaves: the requests sent from it are the ones the system closes. */
  fromDepartmentId: string;
  today: BusinessDate;
  /** The day the transfer takes effect, which is day 1 of the grace. */
  effectiveOn: BusinessDate;
  /** The person heads the department they leave (the caller judged it, so a preview needs no write path). */
  headSuccessorRequired: boolean;
}
