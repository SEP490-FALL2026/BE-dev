import type { Prisma } from '../../generated/prisma/client';

/** What the Super Admin may narrow the trail by (US-01-06 main flow). Every field is optional and they combine. */
export interface AuditEventFilter {
  resourceType?: string;
  /** Only meaningful with `resourceType`: an id means nothing without knowing what it identifies. */
  resourceId?: string;
  actorAppUserId?: string;
  /** Exact match. */
  action?: string;
  /** Inclusive start of the time window. */
  occurredFrom?: Date;
  /** Exclusive end of the time window: the window is `[from, to)`, so adjacent windows never share an event. */
  occurredTo?: Date;
}

/**
 * The one `where` the page and its total are both built from. It never carries an organization: this is
 * one installation for one organization (ADR-01), and the client does not get to choose which log to read.
 */
export function buildAuditEventWhere(filter: AuditEventFilter): Prisma.AuditEventWhereInput {
  const { resourceType, resourceId, actorAppUserId, action, occurredFrom, occurredTo } = filter;

  return {
    ...(resourceType !== undefined ? { resourceType } : {}),
    ...(resourceType !== undefined && resourceId !== undefined ? { resourceId } : {}),
    ...(actorAppUserId !== undefined ? { actorAppUserId } : {}),
    ...(action !== undefined ? { action } : {}),
    ...(occurredFrom !== undefined || occurredTo !== undefined
      ? {
          occurredAt: {
            ...(occurredFrom !== undefined ? { gte: occurredFrom } : {}),
            ...(occurredTo !== undefined ? { lt: occurredTo } : {}),
          },
        }
      : {}),
  };
}
