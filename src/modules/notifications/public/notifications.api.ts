import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { HeldNotificationService } from '../inbox/held-notification.service';
import { InboxService } from '../inbox/inbox.service';
import { NotificationsRepo } from '../notifications.repo';
import {
  DeliveryState,
  EnqueueEmailInput,
  HeldDepartmentNotificationInput,
  InAppNotificationInput,
} from './notifications.types';
import { PayloadCipher } from '../payload-cipher.service';

/** Public facade of the notifications module. */
@Injectable()
export class NotificationsApi {
  constructor(
    private readonly repo: NotificationsRepo,
    private readonly cipher: PayloadCipher,
    private readonly inbox: InboxService,
    private readonly held: HeldNotificationService,
  ) {}

  /**
   * Writes the mail in the caller's transaction, so it exists exactly when the business change
   * commits. Nothing is sent here; the worker delivers it after commit.
   */
  async enqueueEmail(tx: DbTx, input: EnqueueEmailInput): Promise<{ id: string }> {
    const id = randomUUID();
    const sealed = this.cipher.encrypt(id, input.payload);
    await this.repo.insert(tx, {
      id,
      organizationId: input.organizationId,
      recipient: input.recipient,
      template: input.template,
      locale: input.locale,
      actionTokenHash: input.actionTokenHash,
      payloadCiphertext: sealed.ciphertext,
      payloadKeyId: sealed.keyId,
      nextAttemptAt: new Date(),
    });

    return { id };
  }

  /**
   * Gives the person an in-app notice in the caller's transaction, so it exists exactly when the change behind it commits and
   * is gone if that change rolls back (`FR-3.11`). True when it was written, false when the recipient already has a notice for
   * this event key, which is what makes an event tell once however many times it is looked at. No mail is made and nothing is
   * pushed. Throws InvalidInAppNotificationError for a notice the closed table of codes and keys refuses.
   */
  notifyInApp(tx: DbTx, input: InAppNotificationInput): Promise<boolean> {
    return this.inbox.deliver(tx, input);
  }

  /**
   * Keeps a notice for a department that has no head yet, in the caller's transaction (F67, T-11); true when it was kept, false
   * when this event key is already held. Nobody is told until the first head is named. Throws InvalidInAppNotificationError for a
   * notice the closed table refuses.
   */
  holdForDepartment(tx: DbTx, input: HeldDepartmentNotificationInput): Promise<boolean> {
    return this.held.hold(tx, input);
  }

  /**
   * Hands every notice kept for the department to its first head, once, in the caller's transaction (the transaction in which
   * the Super Admin names that head), and to nobody else; returns how many were handed over.
   */
  deliverHeldToHead(
    tx: DbTx,
    input: { organizationId: string; departmentId: string; headEmployeeId: string },
  ): Promise<number> {
    return this.held.deliverToHead(tx, input);
  }

  cancelPendingForTokens(tx: DbTx, actionTokenHashes: string[]): Promise<number> {
    return this.repo.cancelPending(tx, actionTokenHashes);
  }

  deliveryStates(actionTokenHashes: string[]): Promise<Map<string, DeliveryState>> {
    return this.repo.deliveryStates(actionTokenHashes);
  }
}
