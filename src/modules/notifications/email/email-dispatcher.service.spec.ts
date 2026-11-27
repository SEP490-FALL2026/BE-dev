import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { MailSendError } from '../../../infrastructure/mail/mail-transport';
import type { NotificationsRepo } from '../notifications.repo';
import type { ClaimedEmail } from '../public/notifications.types';
import { EmailDispatcher } from './email-dispatcher.service';
import type { PayloadCipher } from './payload-cipher.service';

const email: ClaimedEmail = {
  id: '4939703a-6752-4e49-9cb2-c15e2d3b6cc1',
  recipient: 'fixture@example.test',
  template: 'ACCOUNT_INVITATION',
  locale: 'vi',
  actionTokenHash: null,
  attempts: 1,
  payloadCiphertext: Buffer.from('fixture'),
  payloadKeyId: 'fixture',
};

function fixture(claimed: ClaimedEmail | 'EXHAUSTED' | null) {
  const repo = {
    claimById: jest.fn().mockResolvedValue(claimed),
    markCancelled: jest.fn().mockResolvedValue(true),
    markFailed: jest.fn().mockResolvedValue(true),
    markSent: jest.fn().mockResolvedValue(true),
    renewLease: jest.fn().mockResolvedValue(true),
    reschedule: jest.fn().mockResolvedValue(true),
  };
  const runner = { run: <T>(work: (tx: DbTx) => Promise<T>) => work({} as DbTx) };
  const transport = { send: jest.fn().mockResolvedValue(undefined) };
  const cipher = { decrypt: jest.fn().mockReturnValue({ token: 'fixture', fullName: 'Fixture User' }) };
  const config = new ConfigService<EnvironmentVariables, true>({ APP_PUBLIC_URL: 'https://example.test' });
  const dispatcher = new EmailDispatcher(
    repo as unknown as NotificationsRepo,
    runner as TransactionRunner,
    transport,
    cipher as unknown as PayloadCipher,
    config,
  );
  return { dispatcher, repo, transport };
}

describe('EmailDispatcher.deliverOne', () => {
  it.each([
    ['send', email, true, true, true, undefined, { outcome: 'SENT' }, 1],
    [
      'cancel',
      { ...email, actionTokenHash: 'fixture-hash' },
      false,
      true,
      true,
      undefined,
      { outcome: 'CANCELLED' },
      0,
    ],
    [
      'bad payload',
      { ...email, payloadKeyId: null },
      true,
      true,
      true,
      undefined,
      { outcome: 'FAILED', failureCode: 'PAYLOAD_UNREADABLE' },
      0,
    ],
    [
      'bad template',
      { ...email, template: 'UNKNOWN' },
      true,
      true,
      true,
      undefined,
      { outcome: 'FAILED', failureCode: 'TEMPLATE_UNKNOWN' },
      0,
    ],
    [
      'permanent SMTP',
      email,
      true,
      true,
      true,
      new MailSendError('SMTP_550', true),
      { outcome: 'FAILED', failureCode: 'SMTP_550' },
      1,
    ],
    [
      'last SMTP attempt',
      { ...email, attempts: 5 },
      true,
      true,
      true,
      new MailSendError('SMTP_421', false),
      { outcome: 'FAILED', failureCode: 'SMTP_421' },
      1,
    ],
    [
      'transient SMTP',
      email,
      true,
      true,
      true,
      new MailSendError('SMTP_421', false),
      { outcome: 'RESCHEDULED', failureCode: 'SMTP_421' },
      1,
    ],
    ['lost before send', email, true, false, true, undefined, { outcome: 'LEASE_LOST_BEFORE_SEND' }, 0],
    ['lost after send', email, true, true, false, undefined, { outcome: 'LEASE_LOST_AFTER_SEND' }, 1],
    ['not claimed', null, true, true, true, undefined, { outcome: 'NOT_CLAIMED' }, 0],
    [
      'exhausted lease',
      'EXHAUSTED',
      true,
      true,
      true,
      undefined,
      { outcome: 'FAILED', failureCode: 'ATTEMPTS_EXHAUSTED' },
      0,
    ],
  ] as const)('%s', async (_name, claimed, usable, renew, sent, error, expected, sends) => {
    const { dispatcher, repo, transport } = fixture(claimed);
    repo.renewLease.mockResolvedValue(renew);
    repo.markSent.mockResolvedValue(sent);
    if (error) transport.send.mockRejectedValueOnce(error);
    await expect(dispatcher.deliverOne(email.id, () => Promise.resolve(usable))).resolves.toEqual(expected);
    expect(transport.send).toHaveBeenCalledTimes(sends);
  });
});
