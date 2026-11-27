import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { MailSendError, MailTransport } from '../../../infrastructure/mail/mail-transport';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { renderEmail } from './email-templates.mapper';
import { PayloadDecryptionError, UnknownEmailTemplateError } from '../notifications.errors';
import { EMAIL_ATTEMPTS_EXHAUSTED, MAX_EMAIL_ATTEMPTS, NotificationsRepo } from '../notifications.repo';
import type { DeliveryResult } from '../public/email-delivery.types';
import { ClaimedEmail, EmailTemplate, TokenUsability } from '../public/notifications.types';
import { PayloadCipher } from './payload-cipher.service';

const LEASE_MS = 60_000;
const BATCH_SIZE = 10;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;

function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

/**
 * Delivers the outbox. A tick takes due rows in one short transaction, then does the network
 * work outside any transaction (ADR-0012). It never touches identity tables: whether a link is
 * still worth sending is answered by the `isUsable` callback the caller supplies, and only for mail
 * that carries a token.
 */
@Injectable()
export class EmailDispatcher {
  private readonly logger = new Logger(EmailDispatcher.name);

  constructor(
    private readonly repo: NotificationsRepo,
    private readonly runner: TransactionRunner,
    private readonly transport: MailTransport,
    private readonly cipher: PayloadCipher,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Returns how many rows this call took (whether or not they were delivered). */
  async dispatchDue(isUsable: TokenUsability): Promise<number> {
    const leaseId = randomUUID();
    const now = new Date();
    const claimed = await this.runner.run((tx) =>
      this.repo.claimDue(tx, { now, leaseId, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), limit: BATCH_SIZE }),
    );

    for (const email of claimed) {
      try {
        await this.deliver(email, leaseId, isUsable);
      } catch (error) {
        // One bad row must not stop the rest; its lease expires and it is taken again.
        this.logger.error(
          `Delivery of outbox row ${email.id} failed unexpectedly: ${describeForOperator(error)}`,
          traceForOperator(error),
        );
      }
    }

    return claimed.length;
  }

  dueIds(limit: number, now: Date): Promise<string[]> {
    return this.repo.dueIds(now, limit);
  }

  purgeFinished(before: Date, limit: number): Promise<number> {
    return this.repo.purgeFinished(before, limit);
  }

  async deliverOne(outboxId: string, isUsable: TokenUsability): Promise<DeliveryResult> {
    const now = new Date();
    const leaseId = randomUUID();
    const claimed = await this.runner.run((tx) =>
      this.repo.claimById(tx, { id: outboxId, now, leaseId, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) }),
    );
    if (claimed === null) return { outcome: 'NOT_CLAIMED' };
    if (claimed === 'EXHAUSTED') return { outcome: 'FAILED', failureCode: EMAIL_ATTEMPTS_EXHAUSTED };

    return this.deliver(claimed, leaseId, isUsable);
  }

  private async deliver(email: ClaimedEmail, leaseId: string, isUsable: TokenUsability): Promise<DeliveryResult> {
    let payload: Record<string, unknown>;
    try {
      if (!email.payloadCiphertext || !email.payloadKeyId) throw new PayloadDecryptionError();
      payload = this.cipher.decrypt(email.id, email.payloadKeyId, email.payloadCiphertext);
    } catch (error) {
      if (!(error instanceof PayloadDecryptionError)) throw error;
      return this.failBeforeSend(email.id, leaseId, 'PAYLOAD_UNREADABLE');
    }

    // The link is worthless once its token is revoked or used: do not send it. A notice has no link
    // and no token, so there is nothing to check and it goes out as queued.
    if (email.actionTokenHash !== null && !(await isUsable(email.actionTokenHash))) {
      const cancelled = await this.repo.markCancelled(email.id, leaseId);
      return { outcome: cancelled ? 'CANCELLED' : 'LEASE_LOST_BEFORE_SEND' };
    }

    // Still ours? A slow batch can outlive its lease; never send a row another worker took over.
    if (!(await this.repo.renewLease(email.id, leaseId, new Date(Date.now() + LEASE_MS)))) {
      this.logger.warn(`Outbox row ${email.id} lost its lease before sending; skipped`);
      return { outcome: 'LEASE_LOST_BEFORE_SEND' };
    }

    let rendered: ReturnType<typeof renderEmail>;
    try {
      rendered = renderEmail(
        email.template as EmailTemplate,
        email.locale,
        payload,
        this.config.get('APP_PUBLIC_URL', { infer: true }),
      );
    } catch (error) {
      if (!(error instanceof UnknownEmailTemplateError)) throw error;
      // Retrying cannot help: this build has no such template. Fail it once, for good.
      return this.failBeforeSend(email.id, leaseId, 'TEMPLATE_UNKNOWN');
    }

    try {
      await this.transport.send({ to: email.recipient, subject: rendered.subject, text: rendered.text });
    } catch (error) {
      return this.recordSendFailure(email, leaseId, error);
    }

    if (await this.repo.markSent(email.id, leaseId, new Date())) return { outcome: 'SENT' };

    // The message went out but the row is no longer ours; the recipient may get a duplicate.
    this.logger.warn(`Outbox row ${email.id} was sent but its lease was lost`);
    return { outcome: 'LEASE_LOST_AFTER_SEND' };
  }

  private async failBeforeSend(id: string, leaseId: string, failureCode: string): Promise<DeliveryResult> {
    return (await this.repo.markFailed(id, leaseId, failureCode))
      ? { outcome: 'FAILED', failureCode }
      : { outcome: 'LEASE_LOST_BEFORE_SEND' };
  }

  private async recordSendFailure(email: ClaimedEmail, leaseId: string, error: unknown): Promise<DeliveryResult> {
    const failure = error instanceof MailSendError ? error : new MailSendError('SMTP_ERROR', false);
    if (failure.permanent || email.attempts >= MAX_EMAIL_ATTEMPTS) {
      const failed = await this.repo.markFailed(email.id, leaseId, failure.code);
      return failed ? { outcome: 'FAILED', failureCode: failure.code } : { outcome: 'LEASE_LOST_AFTER_SEND' };
    }
    const rescheduled = await this.repo.reschedule(
      email.id,
      leaseId,
      failure.code,
      new Date(Date.now() + backoffMs(email.attempts)),
    );
    return rescheduled ? { outcome: 'RESCHEDULED', failureCode: failure.code } : { outcome: 'LEASE_LOST_AFTER_SEND' };
  }
}
