import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { InAppNotificationInput, InAppNotificationRecord } from '../public/notifications.types';
import { InAppNotificationRepo } from './in-app-notification.repo';
import { InvalidInAppNotificationError } from '../public/notifications.errors';
import { NotificationNotFoundError } from './inbox.errors';
import { refuseInAppNotification } from './inbox.policy';

/**
 * The inbox of the application: it gives a notice in the transaction of the change behind it and lets a person list, count and
 * mark as read their own notices, nobody else's. The facade `NotificationsApi` reads it for the first, the routes for the
 * rest.
 */
@Injectable()
export class InboxService {
  constructor(private readonly repo: InAppNotificationRepo) {}

  /**
   * Gives the notice in the caller's transaction; true when it was written, false when the recipient already has one for this
   * key. Throws InvalidInAppNotificationError for a notice the closed table refuses.
   */
  async deliver(tx: DbTx, input: InAppNotificationInput): Promise<boolean> {
    const refusal = refuseInAppNotification(input);
    if (refusal) throw new InvalidInAppNotificationError(refusal);

    return this.repo.insertIfAbsent(tx, input);
  }

  async list(
    recipientEmployeeId: string,
    query: { page: number; pageSize: number; unreadOnly: boolean },
  ): Promise<Page<InAppNotificationRecord>> {
    const { rows, total } = await this.repo.page(recipientEmployeeId, {
      unreadOnly: query.unreadOnly,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(rows, total, query.page, query.pageSize);
  }

  unreadCount(recipientEmployeeId: string): Promise<number> {
    return this.repo.unreadCount(recipientEmployeeId);
  }

  /** Throws NotificationNotFoundError when the notice is not in the inbox of this person. */
  async markRead(recipientEmployeeId: string, id: string): Promise<InAppNotificationRecord> {
    const marked = await this.repo.markRead(recipientEmployeeId, id, new Date());
    if (marked === null) throw new NotificationNotFoundError();

    return marked;
  }

  markAllRead(recipientEmployeeId: string): Promise<number> {
    return this.repo.markAllRead(recipientEmployeeId, new Date());
  }
}
