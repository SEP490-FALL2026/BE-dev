import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { EmailDispatcher } from './email-dispatcher.service';
import { NotificationsRepo } from './notifications.repo';
import { DeliveryState, EnqueueEmailInput, TokenUsability } from './notifications.types';
import { PayloadCipher } from './payload-cipher';

/** Public facade of the notifications module. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: NotificationsRepo,
    private readonly cipher: PayloadCipher,
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

  cancelPendingForTokens(tx: DbTx, actionTokenHashes: string[]): Promise<number> {
    return this.repo.cancelPending(tx, actionTokenHashes);
  }

  deliveryStates(actionTokenHashes: string[]): Promise<Map<string, DeliveryState>> {
    return this.repo.deliveryStates(actionTokenHashes);
  }
}

/**
 * The worker-side contract of the notifications module (ROOT.1): delivers the outbox rows that are due, one batch per
 * call. Its only consumer is the worker's mail loop at the composition root (`email-dispatch.loop.ts`, ADR-0012), which
 * supplies whether a link is still worth sending. The dispatcher, the repository, the cipher and the transport stay
 * private to the module.
 */
@Injectable()
export class EmailDeliveryService {
  constructor(private readonly dispatcher: EmailDispatcher) {}

  /** Returns how many rows this call took (whether or not they were delivered). */
  dispatchDue(isUsable: TokenUsability): Promise<number> {
    return this.dispatcher.dispatchDue(isUsable);
  }
}
