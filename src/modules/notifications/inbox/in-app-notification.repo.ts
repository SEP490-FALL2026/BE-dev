import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { InAppNotificationInput, InAppNotificationRecord, InAppParamValue } from '../public/notifications.types';

const READ_SELECT = {
  id: true,
  code: true,
  subjectType: true,
  subjectId: true,
  params: true,
  createdAt: true,
  readAt: true,
} as const;

type Row = Prisma.InAppNotificationGetPayload<{ select: typeof READ_SELECT }>;

function recordOf(row: Row): InAppNotificationRecord {
  // Only a flat object is ever written (the policy refuses anything else), and a CHECK keeps it an object.
  return { ...row, params: row.params as Record<string, InAppParamValue> };
}

/**
 * The only writer of `in_app_notifications`: it inserts a notice in the caller's transaction and sets the moment a notice was
 * read. Every read here is of one recipient, who is always the caller: nothing reaches another person's inbox.
 */
@Injectable()
export class InAppNotificationRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the notice; false when the recipient already has one for this key, which is what makes an event tell once. */
  async insertIfAbsent(tx: DbTx, input: InAppNotificationInput): Promise<boolean> {
    const { count } = await tx.inAppNotification.createMany({
      data: [
        {
          organizationId: input.organizationId,
          recipientEmployeeId: input.recipientEmployeeId,
          code: input.code,
          subjectType: input.subject?.type ?? null,
          subjectId: input.subject?.id ?? null,
          params: input.params,
          eventKey: input.eventKey,
        },
      ],
      skipDuplicates: true,
    });

    return count === 1;
  }

  /** One page of the inbox of the recipient, the newest first (`id` breaks a tie), with the total of the same filter, from one snapshot. */
  async page(
    recipientEmployeeId: string,
    options: { unreadOnly: boolean; skip: number; take: number },
  ): Promise<{ rows: InAppNotificationRecord[]; total: number }> {
    const where: Prisma.InAppNotificationWhereInput = {
      recipientEmployeeId,
      ...(options.unreadOnly ? { readAt: null } : {}),
    };
    const { rows, total } = await this.prisma.$transaction(
      async (tx) => ({
        rows: await tx.inAppNotification.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: options.skip,
          take: options.take,
          select: READ_SELECT,
        }),
        total: await tx.inAppNotification.count({ where }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return { rows: rows.map(recordOf), total };
  }

  unreadCount(recipientEmployeeId: string): Promise<number> {
    return this.prisma.inAppNotification.count({ where: { recipientEmployeeId, readAt: null } });
  }

  /**
   * Sets the moment the notice was read, once: a notice already read keeps the moment it has. Returns the notice as it is
   * after, or null when the recipient has no such notice (it does not exist or belongs to somebody else).
   */
  async markRead(recipientEmployeeId: string, id: string, now: Date): Promise<InAppNotificationRecord | null> {
    await this.prisma.inAppNotification.updateMany({
      where: { id, recipientEmployeeId, readAt: null },
      data: { readAt: now },
    });
    const row = await this.prisma.inAppNotification.findFirst({
      where: { id, recipientEmployeeId },
      select: READ_SELECT,
    });

    return row ? recordOf(row) : null;
  }

  /** Marks every unread notice of the recipient as read; returns how many changed. */
  async markAllRead(recipientEmployeeId: string, now: Date): Promise<number> {
    const { count } = await this.prisma.inAppNotification.updateMany({
      where: { recipientEmployeeId, readAt: null },
      data: { readAt: now },
    });

    return count;
  }
}
