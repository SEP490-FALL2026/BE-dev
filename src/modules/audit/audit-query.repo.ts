import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditEventFilter, buildAuditEventWhere } from './audit-filter';
import { StoredAuditEvent } from './audit.types';

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

    // Only objects are ever written to before/after (AuditEventInput), so the JSON column reads back as one.
    return { items: rows as unknown as StoredAuditEvent[], total };
  }
}
