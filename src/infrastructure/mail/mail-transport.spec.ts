import type { ConfigService } from '@nestjs/config';
import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';
import type { EnvironmentVariables } from '../config/env-schema';
import { MailSendError, SmtpMailTransport } from './mail-transport';

type Mode = 'ok' | 'transient' | 'permanent';

interface Delivery {
  from: string | false;
  to: string[];
  raw: string;
}

/**
 * SEC-UPGRADE-RV-01-F3: the transport with the installed nodemailer, against an in-process SMTP server — addressing,
 * headers, the error mapping and what an error carries. The three nodemailer advisories fixed in 10.1.4 are addressparser
 * bugs that turned text of a recipient field into another recipient; the cases below are their shapes.
 */
describe('SmtpMailTransport (installed nodemailer, in-process SMTP)', () => {
  const FROM = 'SaaS-Sentry <no-reply@acme.test>';
  let server: SMTPServer;
  let port: number;
  let mode: Mode = 'ok';
  let deliveries: Delivery[] = [];

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      logger: false,
      onRcptTo(_address, _session, callback) {
        if (mode === 'transient') return callback(Object.assign(new Error('try later'), { responseCode: 451 }));
        if (mode === 'permanent') return callback(Object.assign(new Error('no such user'), { responseCode: 550 }));
        callback();
      },
      onData(stream, session, callback) {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          deliveries.push({
            from: session.envelope.mailFrom === false ? false : session.envelope.mailFrom.address,
            to: session.envelope.rcptTo.map((recipient) => recipient.address),
            raw: Buffer.concat(chunks).toString('utf8'),
          });
          callback();
        });
      },
    });
    port = await new Promise<number>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve((server.server.address() as AddressInfo).port)),
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    mode = 'ok';
    deliveries = [];
  });

  const transportTo = (smtpPort: number) => {
    const values: Partial<EnvironmentVariables> = {
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: smtpPort,
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      SMTP_FROM: FROM,
      SMTP_TLS: false,
    };
    const config = { get: (key: keyof EnvironmentVariables) => values[key] };

    return new SmtpMailTransport(config as unknown as ConfigService<EnvironmentVariables, true>);
  };
  const failureOf = async (promise: Promise<void>): Promise<MailSendError> => {
    try {
      await promise;
    } catch (error) {
      if (error instanceof MailSendError) return error;
      throw error;
    }
    throw new Error('Expected the send to fail');
  };

  it('delivers one message from the configured sender to exactly the recipient, with its headers and text', async () => {
    await transportTo(port).send({ to: 'user@acme.test', subject: 'Account invitation', text: 'Open the link.' });

    expect(deliveries).toHaveLength(1);
    const [delivery] = deliveries;
    expect({ from: delivery.from, to: delivery.to }).toEqual({ from: 'no-reply@acme.test', to: ['user@acme.test'] });
    // The display name comes back quoted (same before and after 10.1.4).
    expect(delivery.raw).toMatch(/^From: "SaaS-Sentry" <no-reply@acme\.test>\r$/m);
    expect(delivery.raw).toMatch(/^To: user@acme\.test\r$/m);
    expect(delivery.raw).toMatch(/^Subject: Account invitation\r$/m);
    expect(delivery.raw).toContain('Open the link.');
  });

  it('encodes a Vietnamese subject as an RFC 2047 word instead of sending raw bytes', async () => {
    await transportTo(port).send({ to: 'user@acme.test', subject: 'Lời mời kích hoạt tài khoản', text: 'Xin chào' });

    const subject = /^Subject: (.+)\r$/m.exec(deliveries[0].raw)?.[1] ?? '';
    expect(subject).toMatch(/^=\?UTF-8\?[BQ]\?/);
    expect(subject).not.toMatch(/[^\x20-\x7e]/);
  });

  it.each([
    ['a nested comment', 'user@acme.test (note (inner) attacker@evil.test)'],
    ['a ";" inside a quoted display name of a group', 'team: "Ann; attacker@evil.test" <user@acme.test>;'],
    ['a ";" inside a comment of a group', 'team: user@acme.test (x; attacker@evil.test);'],
  ])('reads %s as the one mailbox it names, never the text around it', async (_shape, to) => {
    await transportTo(port).send({ to, subject: 'Notice', text: 'Body' });

    expect(deliveries.map((delivery) => delivery.to)).toEqual([['user@acme.test']]);
  });

  it.each([
    ['a 4xx answer as transient', 'transient', 'SMTP_451', false],
    ['a 5xx answer as permanent', 'permanent', 'SMTP_550', true],
  ] as const)(
    'maps %s, with nothing of the recipient or the text in the error',
    async (_name, answer, code, permanent) => {
      mode = answer;

      const failure = await failureOf(
        transportTo(port).send({ to: 'user@acme.test', subject: 'Notice', text: 'SECRET-BODY' }),
      );

      expect({ code: failure.code, permanent: failure.permanent, message: failure.message }).toEqual({
        code,
        permanent,
        message: `Mail delivery failed (${code}).`,
      });
      expect(deliveries).toEqual([]);
    },
  );

  it('maps a mail server that cannot be reached as transient, by its connection code', async () => {
    const closed = new SMTPServer({ logger: false });
    const closedPort = await new Promise<number>((resolve) =>
      closed.listen(0, '127.0.0.1', () => resolve((closed.server.address() as AddressInfo).port)),
    );
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    const failure = await failureOf(
      transportTo(closedPort).send({ to: 'user@acme.test', subject: 'Notice', text: 'SECRET-BODY' }),
    );

    // A refused connection is nodemailer's socket error (same before and after 10.1.4): retried later, never permanent.
    expect({ code: failure.code, permanent: failure.permanent }).toEqual({ code: 'ESOCKET', permanent: false });
    expect(failure.message).not.toMatch(/user@acme|SECRET-BODY|127\.0\.0\.1/);
  });
});
