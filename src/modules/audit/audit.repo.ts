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
}
