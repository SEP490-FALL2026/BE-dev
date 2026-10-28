import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { InvalidInAppNotificationError } from '../notifications.errors';
import type { HeldDepartmentNotificationInput } from '../notifications.types';
import { HeldNotificationRepo } from './held-notification.repo';
import { InboxService } from './inbox.service';
import { isKnownCode, refuseInAppNotification } from './inbox.policy';

/**
 * Notices for a department that has no head yet (F67, T-11). A notice that would reach the head of a department with none is
 * kept instead of dropped, judged by the same closed table as any inbox notice; when the Super Admin names the first head,
 * every held notice of the department is handed to that head, once, in the same transaction, and to nobody else.
 */
@Injectable()
export class HeldNotificationService {
  constructor(
    private readonly repo: HeldNotificationRepo,
    private readonly inbox: InboxService,
  ) {}

  /**
   * Keeps the notice in the caller's transaction; true when it was kept, false when this event key is already held. Throws
   * InvalidInAppNotificationError for a notice the closed table refuses.
   */
  async hold(tx: DbTx, input: HeldDepartmentNotificationInput): Promise<boolean> {
    // The recipient is not known yet; the judgement looks at the code, the key, the subject and the parameters only.
    const refusal = refuseInAppNotification({ ...input, recipientEmployeeId: input.departmentId });
    if (refusal) throw new InvalidInAppNotificationError(refusal);

    return this.repo.insertIfAbsent(tx, input);
  }

  /** Hands every held notice of the department to the head, in the caller's transaction; returns how many were handed over. */
  async deliverToHead(
    tx: DbTx,
    input: { organizationId: string; departmentId: string; headEmployeeId: string },
  ): Promise<number> {
    const held = await this.repo.lockUndelivered(tx, input.departmentId);
    const delivered: string[] = [];
    for (const row of held) {
      if (!isKnownCode(row.code)) continue;
      await this.inbox.deliver(tx, {
        organizationId: row.organizationId,
        recipientEmployeeId: input.headEmployeeId,
        code: row.code,
        subject:
          row.subjectType !== null && row.subjectId !== null ? { type: row.subjectType, id: row.subjectId } : null,
        params: row.params,
        eventKey: row.eventKey,
      });
      delivered.push(row.id);
    }
    await this.repo.markDelivered(tx, delivered, input.headEmployeeId, new Date());

    return delivered.length;
  }
}
