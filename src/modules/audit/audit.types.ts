export type AuditActorKind = 'USER' | 'SYSTEM' | 'OPERATOR';

/** Plain JSON-compatible value allowed in an audit snapshot. */
export type AuditValue = string | number | boolean | null | AuditValue[] | { [key: string]: AuditValue };

/** One row of the trail as it is read back. The organization is left out: a reader never chooses it. */
export interface StoredAuditEvent {
  id: string;
  occurredAt: Date;
  actorKind: AuditActorKind;
  actorAppUserId: string | null;
  actorRoles: string[];
  action: string;
  resourceType: string;
  resourceId: string;
  before: { [key: string]: AuditValue } | null;
  after: { [key: string]: AuditValue } | null;
  correlationId: string;
  operatorReference: string | null;
}

/** A position in the trail: events are ordered by when they happened and then by id, so two at one instant keep one order. */
export interface AuditCursor {
  occurredAt: Date;
  id: string;
}

/**
 * What a consumer of the system reads of an event (the projection of the status of requests into the inbox): enough to decide who
 * is to be told and no more. It is never shown through HTTP; the readers of the Audit Trail see `StoredAuditEvent`.
 */
export interface AuditEventSlice {
  id: string;
  organizationId: string;
  occurredAt: Date;
  action: string;
  resourceType: string;
  resourceId: string;
  /** Null for the system and for an operator. A value, not a foreign key: the log outlives accounts. */
  actorAppUserId: string | null;
  after: { [key: string]: AuditValue } | null;
}

export interface AuditEventInput {
  organizationId: string;
  actorKind: AuditActorKind;
  /** Null for system and operator actors. A value, not a foreign key: the log outlives accounts. */
  actorAppUserId?: string | null;
  /** Roles the actor held at the time of the action, snapshotted. */
  actorRoles?: readonly string[];
  action: string;
  resourceType: string;
  resourceId: string;
  /** Allow-listed snapshot chosen by the module that owns the data; never a whole record. */
  before?: { [key: string]: AuditValue } | null;
  after?: { [key: string]: AuditValue } | null;
  correlationId: string;
  /** Reference supplied by an operator running an out-of-band command (ticket, approval id). */
  operatorReference?: string | null;
  occurredAt?: Date;
}
