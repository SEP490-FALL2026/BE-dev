import type { BusinessDate } from '../../../core/business-date';
import type { AssignmentKind, ProvisioningKind, ProvisioningTaskStatus, RevocationSource } from './licensing.types';

/** One subscription that grants seats on a day, with the seats bought and taken: what the rule of free seats (`G1`) judges. */
export interface SharedPoolVacancy {
  subscriptionId: string;
  planId: string;
  applicationId: string;
  provisioningType: ProvisioningKind;
  /** Null while the plan has no pricing model; the rule takes only `PER_SEAT`. */
  pricingModel: 'PER_SEAT' | 'FLAT_RATE' | 'CONCURRENT' | 'CONSUMPTION' | 'PER_HOST' | null;
  /** The seats bought; null when the subscription has none. */
  purchased: number | null;
  /** The seats taken on the day (`INV-01`): every assignment not ended and not failed, the invitations and tasks waiting included. */
  occupied: number;
  /** `purchased - occupied` (never below 0); null when `purchased` is. */
  free: number | null;
}

/** The revocation that is under way for a seat: the task, where it stands and who asked for it. */
export interface RuleSeatRevocation {
  taskId: string;
  status: ProvisioningTaskStatus;
  sources: RevocationSource[];
}

/** A seat that is open on a day, with what the rules of wasted seats judge it by. */
export interface RuleSeat {
  assignmentId: string;
  /** The first assignment of the chain of the seat (`predecessor_id`): one chain is one seat for gate 8. */
  chainRootId: string;
  kind: AssignmentKind;
  planId: string;
  applicationId: string;
  subscriptionId: string | null;
  owningDepartmentId: string | null;
  provisioningType: ProvisioningKind;
  pricingModel: 'PER_SEAT' | 'FLAT_RATE' | 'CONCURRENT' | 'CONSUMPTION' | 'PER_HOST' | null;
  employeeId: string;
  expectedEndDate: BusinessDate | null;
  /** The revocation of the seat that is not completed yet (queued, retrying, in progress, failed); null when there is none. */
  liveRevocation: RuleSeatRevocation | null;
  /** The K1 seat whose renewal is cancelled and whose access runs on to this day (`QĐ-77l`); null otherwise. */
  terminatingUntil: BusinessDate | null;
}

/** How a revocation task stands, and which sources and references asked for it. */
export interface RevocationTaskStanding {
  status: ProvisioningTaskStatus;
  referencedSources: RevocationSource[];
  referencedIds: string[];
}
