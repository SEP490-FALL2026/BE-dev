import type { AuditValue } from '../../audit/audit.types';
import type { InAppNotificationCode, InAppParamValue } from '../../notifications/notifications.types';

export type AuditPayload = { [key: string]: AuditValue };

/** An audit event as the projection reads it: what happened, to what, who did it (as an employee) and what it said. */
export interface StatusEvent {
  id: string;
  organizationId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  /** The employee behind the account that acted; null for the system and for an operator. Never told about their own act. */
  actorEmployeeId: string | null;
  after: AuditPayload;
}

/**
 * The facts about the request an event belongs to, read from the data committed after the event, so that who is told and what is
 * said never depends on the order in which a service wrote its audit event and its rows. Only what a rule asks for (`needs`) is
 * read; the rest stays empty.
 */
export interface RequestFacts {
  id: string;
  organizationId: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'RENEWAL' | 'GROUP_GRANT';
  branch: 'INTERNAL_FREE' | 'PAID_IN_CATALOG' | 'NEW_SOFTWARE';
  requesterEmployeeId: string;
  /** The people it is for, the requester among them when the request is for themselves. */
  beneficiaryEmployeeIds: readonly string[];
  departmentId: string;
  withdrawnByEmployeeId: string | null;
  withdrawalReason: string | null;
}

export interface StatusFacts {
  request: RequestFacts | null;
  /** The head of the department of the request today. */
  departmentHeadEmployeeId: string | null;
  /** The IT Admin in charge of the department of the requester today, while they still work. */
  itAdminEmployeeId: string | null;
  financeEmployeeId: string | null;
  superAdminEmployeeId: string | null;
  /** Who decided the step the event is about, and the reason they gave. */
  decision: { deciderEmployeeId: string; reason: string | null } | null;
  /** The refusal of the IT Admin at the gate of the assessment. */
  itRejection: {
    kind: string;
    reason: string;
    alternativePlanId: string | null;
    alternativeNote: string | null;
  } | null;
  /** The plan of the catalog the IT Admin recorded as doing the same work: a suggestion when the spend is refused. */
  equivalentPlanId: string | null;
  /** The homepage the person declared for software that was not in the catalog. */
  homepageUrl: string | null;
  /** The people who held a step that was closed when the request was withdrawn, one for each step. */
  closedStepHolders: readonly { kind: string; employeeId: string }[];
  /** Who holds the assessment step of the request now. */
  assessmentHolderEmployeeId: string | null;
  serviceAccount: { boundaryReason: string | null } | null;
  /** Who decided the spend step of the request. */
  spendDeciderEmployeeId: string | null;
  returnRequest: { id: string; requestedByEmployeeId: string; holderEmployeeId: string } | null;
}

/** What a rule asks to be read before it can say whom to tell. */
export type FactNeed =
  | 'REQUEST'
  | 'DEPARTMENT_HEAD'
  | 'IT_ADMIN'
  | 'FINANCE'
  | 'SUPER_ADMIN'
  | 'DECISION'
  | 'IT_REJECTION'
  | 'EQUIVALENT_PLAN'
  | 'HOMEPAGE'
  | 'CLOSED_STEP_HOLDERS'
  | 'ASSESSMENT_HOLDER'
  | 'SERVICE_ACCOUNT'
  | 'SPEND_DECIDER'
  | 'RETURN';

export const NO_FACTS: StatusFacts = {
  request: null,
  departmentHeadEmployeeId: null,
  itAdminEmployeeId: null,
  financeEmployeeId: null,
  superAdminEmployeeId: null,
  decision: null,
  itRejection: null,
  equivalentPlanId: null,
  homepageUrl: null,
  closedStepHolders: [],
  assessmentHolderEmployeeId: null,
  serviceAccount: null,
  spendDeciderEmployeeId: null,
  returnRequest: null,
};

/** One notice a rule wants told: to whom, what it says, and how to tell it once. */
export interface NotificationIntent {
  /** Employee ids; empty values are skipped and a person named twice is told once. */
  recipients: readonly (string | null)[];
  code: InAppNotificationCode;
  params: Record<string, InAppParamValue>;
  /** Replaces the key made from the event, for a notice the recipient gets once for the whole business event. */
  key?: string;
  /** The person who caused the event is told about it too (the requester who has just sent a request). */
  includeActor?: boolean;
}

/**
 * A row of the table of events: what an audit event of the action means for the inbox. To add an event, add its rule to the
 * table of its file and list the file in `request-status.policy.ts`; the actions to read (`PROJECTED_ACTIONS`) and the facts
 * to load are taken from the rules, so nothing else needs to change.
 */
export interface StatusRule {
  /** What the notices are about, and so which key of the event holds its id. */
  subject: 'ACCESS_REQUEST' | 'RETURN_REQUEST';
  needs: readonly FactNeed[];
  build(event: StatusEvent, facts: StatusFacts): NotificationIntent[];
}

/** A notice ready to be written. */
export interface PlannedNotification {
  organizationId: string;
  recipientEmployeeId: string;
  code: InAppNotificationCode;
  subject: { type: 'ACCESS_REQUEST' | 'RETURN_REQUEST'; id: string };
  params: Record<string, InAppParamValue>;
  eventKey: string;
}
