import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { auditEventAfterJson, auditEventBeforeJson } from './audit-event-payload.json';
import {
  AuditCursor,
  AuditEventInput,
  AuditEventSlice,
  AuditResourceRef,
  ResourceEventQuery,
  ResourceEventSlice,
} from './public/audit.types';

interface ResourceRow {
  id: string;
  occurred_at: Date;
  action: string;
  actor_kind: ResourceEventSlice['actorKind'];
  actor_app_user_id: string | null;
  actor_roles: string[];
  /** The JSON as PostgreSQL returns it; `auditEventAfterJson` says what it is. */
  after: unknown;
}

interface SliceRow {
  id: string;
  organization_id: string;
  occurred_at: Date;
  action: string;
  resource_type: string;
  resource_id: string;
  actor_app_user_id: string | null;
  /** The JSON as PostgreSQL returns it; `auditEventAfterJson` says what it is. */
  after: unknown;
}

@Injectable()
export class AuditRepo {
  /** String field of the earliest event, ordered deterministically, without exposing the rest of its payload. */
  async firstAfterField(tx: DbTx, action: string, field: string): Promise<string | null> {
    const rows = await tx.$queryRaw<{ value: string | null }[]>`
      SELECT CASE WHEN jsonb_typeof("after" -> ${field}) = 'string' THEN "after" ->> ${field} ELSE NULL END AS value
      FROM audit_events WHERE action = ${action} ORDER BY occurred_at, id LIMIT 1`;
    return rows[0]?.value ?? null;
  }

  /** Insert only. The transaction is the caller's, so the event commits or rolls back with the change. */
  async insert(tx: DbTx, event: AuditEventInput): Promise<void> {
    await tx.auditEvent.create({
      data: {
        organizationId: event.organizationId,
        occurredAt: event.occurredAt,
        actorKind: event.actorKind,
        actorAppUserId: event.actorAppUserId ?? null,
        actorRoles: [...(event.actorRoles ?? [])],
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        before: auditEventBeforeJson.encode(event.before ?? null),
        after: auditEventAfterJson.encode(event.after ?? null),
        correlationId: event.correlationId,
        operatorReference: event.operatorReference ?? null,
      },
    });
  }

  /**
   * The events of these actions after the cursor (or from the beginning when there is none) up to and including `upTo`, oldest
   * first by `(occurred_at, id)`, at most `limit`. Instants go to SQL as ISO strings with an offset (see the identity repo for
   * why). Reads only, in the caller's transaction.
   */
  async readSince(
    tx: DbTx,
    cursor: AuditCursor | null,
    options: { upTo: Date; actions: readonly string[]; limit: number },
  ): Promise<AuditEventSlice[]> {
    const upTo = options.upTo.toISOString();
    const after = cursor?.occurredAt.toISOString() ?? null;
    const afterId = cursor?.id ?? null;
    const actions = [...options.actions];
    const rows = await tx.$queryRaw<SliceRow[]>`
      SELECT id, organization_id, occurred_at, action, resource_type, resource_id, actor_app_user_id, after
        FROM audit_events
       WHERE action = ANY(${actions}::text[])
         AND occurred_at <= ${upTo}::timestamptz
         AND (${after}::timestamptz IS NULL OR (occurred_at, id) > (${after}::timestamptz, ${afterId}::uuid))
       ORDER BY occurred_at, id
       LIMIT ${options.limit}::int`;

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      occurredAt: row.occurred_at,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      actorAppUserId: row.actor_app_user_id,
      after: auditEventAfterJson.decode(row.after),
    }));
  }

  /**
   * The events of these resources and actions, oldest first, one page and the count for the same filter. With `onlySubject`, an event
   * whose `after` names another subject under one of the keys is left out in SQL, so the page and the total agree. Reads only, in the
   * caller's transaction, one statement after the other (R2).
   */
  async pageOfResources(
    tx: DbTx,
    resources: readonly AuditResourceRef[],
    query: ResourceEventQuery,
  ): Promise<{ rows: ResourceEventSlice[]; total: number }> {
    if (resources.length === 0 || query.actions.length === 0) return { rows: [], total: 0 };
    const types = resources.map((resource) => resource.type);
    const ids = resources.map((resource) => resource.id);
    const actions = [...query.actions];
    const keys = [...(query.onlySubject?.keys ?? [])];
    const subject = query.onlySubject?.subject ?? null;
    const where = Prisma.sql`
       (resource_type, resource_id) IN (SELECT t, i FROM unnest(${types}::text[], ${ids}::text[]) AS r(t, i))
       AND action = ANY(${actions}::text[])
       AND (${subject}::text IS NULL OR NOT EXISTS (
             SELECT 1 FROM unnest(${keys}::text[]) AS k(key)
              WHERE after ->> k.key IS NOT NULL AND after ->> k.key <> ${subject}::text))`;
    const [counted] = await tx.$queryRaw<
      { total: number }[]
    >`SELECT count(*)::int AS total FROM audit_events WHERE ${where}`;
    const rows = await tx.$queryRaw<ResourceRow[]>`
      SELECT id, occurred_at, action, actor_kind, actor_app_user_id, actor_roles, after
        FROM audit_events
       WHERE ${where}
       ORDER BY occurred_at, id
      OFFSET ${query.skip}::int LIMIT ${query.take}::int`;

    return {
      total: counted?.total ?? 0,
      rows: rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurred_at,
        action: row.action,
        actorKind: row.actor_kind,
        actorAppUserId: row.actor_app_user_id,
        actorRoles: row.actor_roles,
        after: auditEventAfterJson.decode(row.after),
      })),
    };
  }

  /** How many events each of these actions has; an action with none is absent from the map. */
  async countByAction(tx: DbTx, actions: readonly string[]): Promise<Map<string, number>> {
    const groups = await tx.auditEvent.groupBy({
      by: ['action'],
      where: { action: { in: [...actions] } },
      _count: { _all: true },
    });

    return new Map(groups.map((group) => [group.action, group._count._all]));
  }
}
