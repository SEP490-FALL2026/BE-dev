import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { EnvironmentVariables } from '../infrastructure/config/env-schema';
import type { QueueWorkerFactory } from '../infrastructure/queue/queue-worker-factory';
import type { IdentityAccessApi } from '../modules/identity-access/public/identity-access.api';
import type { EmailDeliveryApi } from '../modules/notifications/public/email-delivery.api';
import type { DeliveryResult } from '../modules/notifications/public/email-delivery.types';
import { EmailQueueConsumer, jobErrorCodeFor } from './email-queue.job';

const outboxId = '4939703a-6752-4e49-9cb2-c15e2d3b6cc1';
const job = { name: 'deliver', data: { outboxId } } as Job;

function fixture(result?: DeliveryResult) {
  const email = { deliverOne: jest.fn().mockResolvedValue(result) };
  const identity = { isActionLinkUsable: jest.fn().mockResolvedValue(true) };
  const consumer = new EmailQueueConsumer(
    {} as QueueWorkerFactory,
    email as unknown as EmailDeliveryApi,
    identity as unknown as IdentityAccessApi,
    new ConfigService<EnvironmentVariables, true>(),
  );
  return { consumer, email };
}

describe('email queue processor', () => {
  it.each([
    'SENT',
    'CANCELLED',
    'RESCHEDULED',
    'LEASE_LOST_BEFORE_SEND',
    'LEASE_LOST_AFTER_SEND',
    'NOT_CLAIMED',
  ] as const)('completes %s with only its outcome', async (outcome) => {
    const { consumer, email } = fixture({ outcome });
    await expect(consumer.process(job)).resolves.toEqual({ outcome });
    expect(email.deliverOne).toHaveBeenCalledWith(outboxId, expect.any(Function));
  });

  it('fails a permanent delivery with the mapped code only', async () => {
    const { consumer } = fixture({ outcome: 'FAILED', failureCode: 'SMTP_550' });
    await expect(consumer.process(job)).rejects.toMatchObject({ message: 'SMTP_5xx' });
  });

  it.each([{ value: 1 }, { outboxId: 'x' }, { outboxId, other: 1 }])('rejects malformed data %j', async (data) => {
    const { consumer, email } = fixture();
    await expect(consumer.process({ name: 'deliver', data } as Job)).rejects.toMatchObject({
      message: 'JOB_DATA_INVALID',
    });
    expect(email.deliverOne).not.toHaveBeenCalled();
  });

  it('rejects an unexpected job name', async () => {
    const { consumer, email } = fixture();
    await expect(consumer.process({ name: 'unknown', data: { outboxId } } as Job)).rejects.toMatchObject({
      message: 'JOB_DATA_INVALID',
    });
    expect(email.deliverOne).not.toHaveBeenCalled();
  });

  it('does not expose the error message in Redis or logs', async () => {
    const { consumer, email } = fixture();
    email.deliverOne.mockRejectedValue(new Error('delivery failed for user@example.test'));
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await expect(consumer.process(job)).rejects.toMatchObject({ message: 'UNEXPECTED' });
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalledWith(expect.stringContaining('user@example.test'));
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    ['SMTP_550', 'SMTP_5xx'],
    ['SMTP_421', 'ATTEMPTS_EXHAUSTED'],
    ['ECONNECTION', 'ATTEMPTS_EXHAUSTED'],
    ['SMTP_5', 'ATTEMPTS_EXHAUSTED'],
    ['PAYLOAD_UNREADABLE', 'PAYLOAD_UNREADABLE'],
    ['TEMPLATE_UNKNOWN', 'TEMPLATE_UNKNOWN'],
  ])('maps %s to %s', (original, expected) => {
    expect(jobErrorCodeFor(original)).toBe(expected);
  });
});
