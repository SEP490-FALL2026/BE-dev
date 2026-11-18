import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditEventFilter, buildAuditEventWhere } from './audit-filter.repo';
import { auditEventAfterJson, auditEventBeforeJson } from './audit-event-payload.json';
import { StoredAuditEvent } from './public/audit.types';

/** Everything a reader gets, and nothing else: no organization, no internal column. */
const READ_SELECT = {
  id: true,
  occurredAt: true,
  actorKind: true,
  actorAppUserId: true,
  actorRoles: true,
  action: true,
  resourceType: true,
  resourceId: true,
  before: true,
  after: true,
  correlationId: true,
  operatorReference: true,
} as const;

type EventRow = Prisma.AuditEventGetPayload<{ select: typeof READ_SELECT }>;

/** The row as a reader gets it: the snapshots through their codec, so a JSON that is not an object is told, not passed on. */
const toStoredEvent = (row: EventRow): StoredAuditEvent => ({
  id: row.id,
  occurredAt: row.occurredAt,
  actorKind: row.actorKind,
  actorAppUserId: row.actorAppUserId,
  actorRoles: row.actorRoles,
  action: row.action,
  resourceType: row.resourceType,
  resourceId: row.resourceId,
  before: auditEventBeforeJson.decode(row.before),
  after: auditEventAfterJson.decode(row.after),
  correlationId: row.correlationId,
  operatorReference: row.operatorReference,
});

/**
 * Reads the Audit Trail. Kept apart from `AuditRepo`, which only ever inserts inside someone else's
 * transaction: nothing that reads can reach the code that writes.
 */
@Injectable()
export class AuditQueryRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the trail, newest first, and the total for the same filter. Both reads share one
   * snapshot (RepeatableRead), so an event written meanwhile cannot make the total disagree with the page
   * just returned. `id` breaks ties between events at the same instant, so the order is always the same
   * and no event is skipped or repeated across pages. Reads only; takes no row lock.
   */
  async findPage(request: AuditEventFilter & { skip: number; take: number }): Promise<{
    items: StoredAuditEvent[];
    total: number;
  }> {
    const { skip, take, ...filter } = request;
    const where = buildAuditEventWhere(filter);

    const { rows, total } = await this.prisma.$transaction(
      async (tx) => ({
        rows: await tx.auditEvent.findMany({
          where,
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
          select: READ_SELECT,
        }),
        total: await tx.auditEvent.count({ where }),
      }),
      { isolationLevel: 'RepeatableRead' },
    );

    return { items: rows.map(toStoredEvent), total };
  }
}
