import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Worker } from 'bullmq';
import { z } from 'zod';
import type { EnvironmentVariables } from '../infrastructure/config/env-schema';
import { describeForOperator } from '../infrastructure/observability/operator-error';
import { QueueWorkerFactory } from '../infrastructure/queue/queue-worker-factory';
import { IdentityAccessApi } from '../modules/identity-access/public/identity-access.api';
import { EmailDeliveryApi } from '../modules/notifications/public/email-delivery.api';
import type { DeliveryOutcome } from '../modules/notifications/public/email-delivery.types';

export const EMAIL_JOB_ERROR_CODES = [
  'SMTP_5xx',
  'PAYLOAD_UNREADABLE',
  'TEMPLATE_UNKNOWN',
  'ATTEMPTS_EXHAUSTED',
  'JOB_DATA_INVALID',
  'UNEXPECTED',
] as const;

type EmailJobErrorCode = (typeof EMAIL_JOB_ERROR_CODES)[number];
type JobResult = { outcome: DeliveryOutcome } | { errorCode: EmailJobErrorCode };
const jobData = z.strictObject({ outboxId: z.uuid() });

export function jobErrorCodeFor(failureCode: string): EmailJobErrorCode {
  if (failureCode === 'PAYLOAD_UNREADABLE' || failureCode === 'TEMPLATE_UNKNOWN') return failureCode;
  return /^SMTP_5\d\d$/.test(failureCode) ? 'SMTP_5xx' : 'ATTEMPTS_EXHAUSTED';
}

@Injectable()
export class EmailQueueConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueConsumer.name);
  private worker?: Worker;

  constructor(
    private readonly workers: QueueWorkerFactory,
    private readonly email: EmailDeliveryApi,
    private readonly identity: IdentityAccessApi,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onApplicationBootstrap(): void {
    this.worker = this.workers.create(
      'email-delivery',
      (job) => this.process(job),
      this.config.get('EMAIL_QUEUE_CONCURRENCY', { infer: true }),
    );
    void this.workers.run(this.worker).catch((error: unknown) => {
      if (this.worker?.closing) return;
      this.logger.error(`Email queue worker stopped: ${describeForOperator(error)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) await this.workers.close(this.worker);
  }

  async process(job: Job): Promise<{ outcome: DeliveryOutcome }> {
    let result: JobResult;
    try {
      result = await this.deliver(job);
    } catch (error) {
      this.logger.error(`Unexpected email job failure: ${describeForOperator(error)}`);
      throw new Error('UNEXPECTED');
    }
    if ('errorCode' in result) throw new Error(result.errorCode);
    return result;
  }

  private async deliver(job: Job): Promise<JobResult> {
    const parsed = jobData.safeParse(job.data);
    if (!parsed.success || job.name !== 'deliver') return { errorCode: 'JOB_DATA_INVALID' };

    const { outboxId } = parsed.data;
    const result = await this.email.deliverOne(outboxId, (hash) => this.identity.isActionLinkUsable(hash));
    if (result.outcome !== 'FAILED') return { outcome: result.outcome };

    const original = result.failureCode ?? 'ATTEMPTS_EXHAUSTED';
    const errorCode = jobErrorCodeFor(original);
    const safeCode = /^[A-Z0-9_]{2,32}$/.test(original) ? original : errorCode;
    this.logger.warn(`Email job ${outboxId} failed: ${safeCode}`);
    return { errorCode };
  }
}
