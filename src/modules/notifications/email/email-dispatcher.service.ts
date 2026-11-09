import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { MailSendError, MailTransport } from '../../../infrastructure/mail/mail-transport';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { renderEmail } from './email-templates.mapper';
import { PayloadDecryptionError, UnknownEmailTemplateError } from '../notifications.errors';
import { NotificationsRepo } from '../notifications.repo';
import { ClaimedEmail, EmailTemplate, TokenUsability } from '../public/notifications.types';
import { PayloadCipher } from './payload-cipher.service';

const MAX_ATTEMPTS = 5;
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

  private async deliver(email: ClaimedEmail, leaseId: string, isUsable: TokenUsability): Promise<void> {
    let payload: Record<string, unknown>;
    try {
      if (!email.payloadCiphertext || !email.payloadKeyId) throw new PayloadDecryptionError();
      payload = this.cipher.decrypt(email.id, email.payloadKeyId, email.payloadCiphertext);
    } catch (error) {
      if (!(error instanceof PayloadDecryptionError)) throw error;
      await this.repo.markFailed(email.id, leaseId, 'PAYLOAD_UNREADABLE');
      return;
    }

    // The link is worthless once its token is revoked or used: do not send it. A notice has no link
    // and no token, so there is nothing to check and it goes out as queued.
    if (email.actionTokenHash !== null && !(await isUsable(email.actionTokenHash))) {
      await this.repo.markCancelled(email.id, leaseId);
      return;
    }

    // Still ours? A slow batch can outlive its lease; never send a row another worker took over.
    if (!(await this.repo.renewLease(email.id, leaseId, new Date(Date.now() + LEASE_MS)))) {
      this.logger.warn(`Outbox row ${email.id} lost its lease before sending; skipped`);
      return;
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
      await this.repo.markFailed(email.id, leaseId, 'TEMPLATE_UNKNOWN');
      return;
    }

    try {
      await this.transport.send({ to: email.recipient, subject: rendered.subject, text: rendered.text });
    } catch (error) {
      const failure = error instanceof MailSendError ? error : new MailSendError('SMTP_ERROR', false);
      if (failure.permanent || email.attempts >= MAX_ATTEMPTS) {
        await this.repo.markFailed(email.id, leaseId, failure.code);
      } else {
        await this.repo.reschedule(email.id, leaseId, failure.code, new Date(Date.now() + backoffMs(email.attempts)));
      }
      return;
    }

    if (!(await this.repo.markSent(email.id, leaseId, new Date()))) {
      // The message went out but the row is no longer ours; the recipient may get a duplicate.
      this.logger.warn(`Outbox row ${email.id} was sent but its lease was lost`);
    }
  }
}
