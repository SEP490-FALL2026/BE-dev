import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { AuditCursor, AuditEventInput, AuditEventSlice, AuditValue } from './public/audit.types';

interface SliceRow {
  id: string;
  organization_id: string;
  occurred_at: Date;
  action: string;
  resource_type: string;
  resource_id: string;
  actor_app_user_id: string | null;
  after: { [key: string]: AuditValue } | null;
}

@Injectable()
export class AuditRepo {
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
        before: event.before ?? Prisma.DbNull,
        after: event.after ?? Prisma.DbNull,
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
      after: row.after,
    }));
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
