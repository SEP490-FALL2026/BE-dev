import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { ClaimedEmail, DeliveryState } from './notifications.types';

interface ClaimedRow {
  id: string;
  recipient: string;
  template: string;
  locale: string;
  action_token_hash: string | null;
  attempts: number;
  payload_ciphertext: Buffer | null;
  payload_key_id: string | null;
}

@Injectable()
export class NotificationsRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: {
      id: string;
      organizationId: string;
      recipient: string;
      template: string;
      locale: string;
      actionTokenHash: string | null;
      payloadCiphertext: Buffer;
      payloadKeyId: string;
      nextAttemptAt: Date;
    },
  ): Promise<void> {
    await tx.emailOutbox.create({
      data: { ...input, payloadCiphertext: new Uint8Array(input.payloadCiphertext), status: 'PENDING' },
    });
  }

  /** Pending mail for these tokens is cancelled and its payload wiped. Mail already sending or sent is untouched. */
  async cancelPending(tx: DbTx, actionTokenHashes: string[]): Promise<number> {
    if (actionTokenHashes.length === 0) return 0;

    const result = await tx.emailOutbox.updateMany({
      where: { actionTokenHash: { in: actionTokenHashes }, status: 'PENDING' },
      data: { status: 'CANCELLED', payloadCiphertext: null, payloadKeyId: null },
    });

    return result.count;
  }

  /**
   * Takes due rows with `FOR UPDATE SKIP LOCKED`, so concurrent dispatchers never share a row,
   * and marks them SENDING under a lease. A SENDING row whose lease ran out is taken again.
   * Instants go to SQL as ISO strings with an offset (see the identity repo for why).
   */
  async claimDue(
    tx: DbTx,
    input: { now: Date; leaseId: string; leaseExpiresAt: Date; limit: number },
  ): Promise<ClaimedEmail[]> {
    const now = input.now.toISOString();
    const leaseExpiresAt = input.leaseExpiresAt.toISOString();
    const rows = await tx.$queryRaw<ClaimedRow[]>`
      UPDATE email_outbox SET status = 'SENDING', lease_id = ${input.leaseId}::uuid,
        lease_expires_at = ${leaseExpiresAt}::timestamptz, attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM email_outbox
        WHERE (status = 'PENDING' AND next_attempt_at <= ${now}::timestamptz)
           OR (status = 'SENDING' AND lease_expires_at <= ${now}::timestamptz)
        ORDER BY next_attempt_at
        LIMIT ${input.limit}::int
        FOR UPDATE SKIP LOCKED)
      RETURNING id, recipient, template, locale, action_token_hash, attempts, payload_ciphertext, payload_key_id`;

    return rows.map((row) => ({
      id: row.id,
      recipient: row.recipient,
      template: row.template,
      locale: row.locale,
      actionTokenHash: row.action_token_hash,
      attempts: row.attempts,
      payloadCiphertext: row.payload_ciphertext,
      payloadKeyId: row.payload_key_id,
    }));
  }

  // Results are written only while the row is still ours: SENDING under the same lease. A row
  // cancelled meanwhile, or taken by another dispatcher after the lease ran out, is not overwritten.

  /**
   * Called right before the network send. The batch lease was taken for every row at once, so a
   * slow batch can outlive it and another worker may have re-claimed this row. Only a row that is
   * still ours (same lease) is renewed and sent; otherwise the caller must not send it.
   */
  async renewLease(id: string, leaseId: string, leaseExpiresAt: Date): Promise<boolean> {
    const result = await this.prisma.emailOutbox.updateMany({
      where: { id, leaseId, status: 'SENDING' },
      data: { leaseExpiresAt },
    });

    return result.count === 1;
  }

  async markSent(id: string, leaseId: string, now: Date): Promise<boolean> {
    return this.finish(id, leaseId, { status: 'SENT', sentAt: now, lastErrorCode: null });
  }

  async markCancelled(id: string, leaseId: string): Promise<boolean> {
    return this.finish(id, leaseId, { status: 'CANCELLED' });
  }

  async markFailed(id: string, leaseId: string, errorCode: string): Promise<boolean> {
    return this.finish(id, leaseId, { status: 'FAILED', lastErrorCode: errorCode });
  }

  async reschedule(id: string, leaseId: string, errorCode: string, nextAttemptAt: Date): Promise<boolean> {
    const result = await this.prisma.emailOutbox.updateMany({
      where: { id, leaseId, status: 'SENDING' },
      data: { status: 'PENDING', leaseId: null, leaseExpiresAt: null, lastErrorCode: errorCode, nextAttemptAt },
    });

    return result.count === 1;
  }

  async deliveryStates(actionTokenHashes: string[]): Promise<Map<string, DeliveryState>> {
    const rows = await this.prisma.emailOutbox.findMany({
      where: { actionTokenHash: { in: actionTokenHashes } },
      select: { actionTokenHash: true, status: true, attempts: true, lastErrorCode: true, sentAt: true },
    });

    const states = new Map<string, DeliveryState>();
    for (const row of rows) {
      // Only mail with a token can be asked about by token; a notice without one has no key.
      if (row.actionTokenHash === null) continue;
      states.set(row.actionTokenHash, {
        status: row.status,
        attempts: row.attempts,
        lastErrorCode: row.lastErrorCode,
        sentAt: row.sentAt,
      });
    }

    return states;
  }

  private async finish(
    id: string,
    leaseId: string,
    data: { status: 'SENT' | 'CANCELLED' | 'FAILED'; sentAt?: Date; lastErrorCode?: string | null },
  ): Promise<boolean> {
    const result = await this.prisma.emailOutbox.updateMany({
      where: { id, leaseId, status: 'SENDING' },
      data: { ...data, leaseId: null, leaseExpiresAt: null, payloadCiphertext: null, payloadKeyId: null },
    });

    return result.count === 1;
  }
}
