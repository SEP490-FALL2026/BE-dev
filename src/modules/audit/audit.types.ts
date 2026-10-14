export type AuditActorKind = 'USER' | 'SYSTEM' | 'OPERATOR';

/** Plain JSON-compatible value allowed in an audit snapshot. */
export type AuditValue = string | number | boolean | null | AuditValue[] | { [key: string]: AuditValue };

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
