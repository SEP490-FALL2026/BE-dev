import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { AuditEventInput } from './audit.types';

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
