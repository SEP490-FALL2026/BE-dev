import type { BusinessDate } from '../../../core/business-date';
import type { HandoverSourceKind, ItHandoverState } from './it-handover.policy';

/** The file an IT Admin who leaves is handed over from: a departure or a transfer. */
export interface HandoverSource {
  kind: HandoverSourceKind;
  id: string;
}

/** The facts of the file the hand-over is judged on, read in the transaction (the row held `FOR UPDATE` when the use case writes). */
export interface HandoverSourceFacts extends HandoverSource {
  organizationId: string;
  employeeId: string;
  cancelled: boolean;
  /** A departure: the day the person left, if they did. A transfer: null. */
  leftOn: BusinessDate | null;
  /** A transfer: the day it takes effect. A departure: null. */
  effectiveOn: BusinessDate | null;
}

/** The row kept when the file was recorded: what the person answered for then, and the one hand-over. */
export interface HandoverItem {
  id: string;
  organizationId: string;
  subscriptionsAtRecord: number;
  applicationsAtRecord: number;
  done: { at: Date; toEmployeeId: string; subscriptions: number; applications: number } | null;
}

/**
 * The `itHandover` section of a departure or a transfer (SPEC P3): what the person still answers for in the catalog, and whether the hand-over
 * of all of it is pending or done. `subscriptions` and `applications` are what is left now; after the hand-over they are what the hand-over
 * moved (`handedOver`) and 0 left.
 */
export interface ItHandoverView {
  state: ItHandoverState;
  subscriptions: number;
  applications: number;
  handedOver: { at: Date; toEmployeeId: string; subscriptions: number; applications: number } | null;
}
