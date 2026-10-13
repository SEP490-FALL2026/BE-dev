import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { NotificationsRepo } from './notifications.repo';
import { PAYLOAD_CIPHER } from './notifications.tokens';
import { DeliveryState, EnqueueEmailInput } from './notifications.types';
import { PayloadCipher } from './payload-cipher';

/** Public facade of the notifications module. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: NotificationsRepo,
    @Inject(PAYLOAD_CIPHER) private readonly cipher: PayloadCipher,
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
