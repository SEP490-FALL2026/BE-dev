import type { BusinessDate } from '../../../core/business-date';
import type { AuditValue } from '../../audit/public/audit.types';
import type { RevocationSource } from './licensing.types';

/**
 * Who the Audit Trail names for the handover events when the caller is the controlled procedure `ops:record-super-admin-event`
 * (spec L.2): an operator working a ticket, never an account. The `actor` the facade is given then only fills the columns that
 * still demand an account; the events say `OPERATOR`, no account, the ticket as the reference and as the correlation. `context`
 * is what the command adds to the `after` of every event it writes (references only).
 */
export interface OperatorAuditActor {
  ticketId: string;
  ticketRef: string;
  context?: { readonly [key: string]: AuditValue };
}

/**
 * What a source that knows the person who leaves ahead of time hands to `LicensingApi.openHandoverDuties`: the planned
 * departure opens the handover when it is recorded, before any revocation task exists (`US-03-09` AC-1). Every other source opens
 * its duty through the hook of the revocation and needs none of this.
 */
export interface OpenHandoverDutiesInput {
  leaverEmployeeId: string;
  /** `DEPARTURE` for the planned departure, `ABRUPT_DEPARTURE` when nobody planned it. */
  source: RevocationSource;
  /** The record of the case (the departure) the duties belong to, so a change or a cancellation of it finds them. */
  caseRefId: string | null;
  /** The last day the person works; the day after it is the day a successor to a head who leaves is looked up for. */
  lastWorkingDay: BusinessDate;
  /**
   * The day the confirmation is due, worked out by the caller from the calendar of working days: the last working day less one
   * working day for a planned departure (`OI-14c`), a short time from today for an abrupt one.
   */
  dueOn: BusinessDate;
  /** Whether the person who leaves heads their department today: then a successor, not the person, is who confirms. */
  leaverIsHead: boolean;
  /** The department the head is looked up for; the department of the person today when not given. */
  departmentId?: string;
  now?: Date;
  /** Set when the departure is recorded by the controlled procedure: the events of the duties are audited as that operator. */
  operator?: OperatorAuditActor;
}

/** What opening the duties of a person did: the duties made, and the seats whose duty was there already or needs none. */
export interface OpenedHandoverDuties {
  opened: { dutyId: string; assignmentId: string }[];
  reused: number;
  notRequired: number;
}

/** Where the handover confirmation of a seat stands, as the record of a departure shows it beside the seat. */
export interface HandoverDutyBrief {
  dutyId: string;
  assignmentId: string;
  status: 'OPEN' | 'CONFIRMED' | 'CANCELLED';
  role: 'DEPARTMENT_HEAD' | 'REQUESTER' | 'IT_ADMIN';
  /** Who it falls to now, read from the organization; null while nobody can (see `waitingReason`) or for the IT Admin. */
  confirmerEmployeeId: string | null;
  waitingReason: 'NO_HEAD' | 'NO_SUCCESSOR' | null;
  dueOn: BusinessDate;
  overdue: boolean;
  /** The work went on without the confirmation once its deadline passed. */
  flaggedUnconfirmed: boolean;
}

/** The change of a case that moves the deadline of the duties it opened (`US-03-04` AC-14). */
export interface ReconcileHandoverInput {
  caseRefId: string;
  dueOn: BusinessDate;
  /** The new last working day, when the day a successor is looked up for moves with it. */
  lastWorkingDay?: BusinessDate;
  now?: Date;
  /** Set when the change is made by the controlled procedure: the events are audited as that operator. */
  operator?: OperatorAuditActor;
}

/** The cancellation of a case: the duties still waiting for a confirmation are cancelled with the reason (`US-03-04` AC-15). */
export interface CancelHandoverInput {
  caseRefId: string;
  reason: string;
  now?: Date;
  /** Set when the cancellation is made by the controlled procedure: the events are audited as that operator. */
  operator?: OperatorAuditActor;
}
