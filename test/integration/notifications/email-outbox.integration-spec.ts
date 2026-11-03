import { randomUUID } from 'node:crypto';
import { SMTPServer } from 'smtp-server';
import { fakeSmtpEnvironment, listenOnLoopback } from '../../support/fake-smtp';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { EmailDispatcher } from '../../../src/modules/notifications/email/email-dispatcher.service';
import { NotificationsApi } from '../../../src/modules/notifications/public/notifications.api';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';

type SmtpMode = 'ok' | 'transient' | 'permanent';

interface Received {
  to: string[];
  body: string;
}

/** Nodemailer sends non-ASCII text as quoted-printable; undo it so the tests can read the body. */
function decodeQuotedPrintable(raw: string): string {
  const softBreak = String.fromCharCode(61, 13, 10);
  const unfolded = raw.split(softBreak).join('');
  const bytes = Buffer.from(
    unfolded.replace(/=([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16))),
    'latin1',
  );

  return bytes.toString('utf8');
}

describe('email outbox and dispatcher (integration, PostgreSQL + in-process SMTP)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let runner: TransactionRunner;
  let notifications: NotificationsApi;
  let dispatcher: EmailDispatcher;
  let smtp: SMTPServer;
  let mode: SmtpMode = 'ok';
  let received: Received[] = [];
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    smtp = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      onRcptTo(_address, _session, callback) {
        if (mode === 'transient') return callback(Object.assign(new Error('try later'), { responseCode: 451 }));
        if (mode === 'permanent') return callback(Object.assign(new Error('no such user'), { responseCode: 550 }));
        callback();
      },
      onData(stream, session, callback) {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          received.push({
            to: session.envelope.rcptTo.map((r) => r.address),
            body: decodeQuotedPrintable(Buffer.concat(chunks).toString()),
          });
          callback();
        });
      },
    });
    // The suite owns the whole SMTP configuration (H7-VRF-01); `originalEnv` is restored in afterAll.
    Object.assign(process.env, fakeSmtpEnvironment(await listenOnLoopback(smtp)));
    process.env.APP_PUBLIC_URL = 'https://app.acme.test';

    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    runner = ctx.app.get(TransactionRunner);
    notifications = ctx.app.get(NotificationsApi, { strict: false });
    dispatcher = ctx.app.get(EmailDispatcher, { strict: false });
  }, 90000);

  afterAll(async () => {
    await ctx?.close();
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
    process.env = originalEnv;
  });

  beforeEach(async () => {
    mode = 'ok';
    received = [];
    await ctx.sql.query('DELETE FROM email_outbox');
  });

  const usableAlways = () => Promise.resolve(true);

  const enqueue = (token = `tok-${randomUUID()}`, recipient = 'new.user@acme.vn') => {
    const hash = `h-${randomUUID()}`;

    return runner
      .run((tx) =>
        notifications.enqueueEmail(tx, {
          organizationId: seed.organizationId,
          recipient,
          template: 'ACCOUNT_INVITATION',
          locale: 'vi',
          actionTokenHash: hash,
          payload: { token, expiresAt: '2026-10-20T00:00:00.000Z', fullName: 'New User' },
        }),
      )
      .then((row) => ({ ...row, token, hash }));
  };

  const rowOf = async (id: string) =>
    (await ctx.sql.query('SELECT * FROM email_outbox WHERE id = $1', [id])).rows[0] as Record<string, unknown>;

  it('stores the payload encrypted and rolls back with the business transaction', async () => {
    const mail = await enqueue('plain-token-value');
    const row = await rowOf(mail.id);

    expect(row.status).toBe('PENDING');
    expect((row.payload_ciphertext as Buffer).toString('utf8')).not.toContain('plain-token-value');
    expect(JSON.stringify({ ...row, payload_ciphertext: undefined })).not.toContain('plain-token-value');

    await expect(
      runner.run(async (tx) => {
        await notifications.enqueueEmail(tx, {
          organizationId: seed.organizationId,
          recipient: 'x@acme.vn',
          template: 'ACCOUNT_INVITATION',
          locale: 'vi',
          actionTokenHash: 'hash-rolled-back',
          payload: { token: 'rolled-back' },
        });
        throw new Error('business step failed');
      }),
    ).rejects.toThrow('business step failed');
    const { rows } = await ctx.sql.query("SELECT 1 FROM email_outbox WHERE action_token_hash = 'hash-rolled-back'");
    expect(rows).toHaveLength(0);
  });

  it('delivers a due message with the activation link, marks it SENT and clears the ciphertext', async () => {
    const mail = await enqueue('deliver-me');

    expect(await dispatcher.dispatchDue(usableAlways)).toBe(1);

    expect(received).toHaveLength(1);
    expect(received[0].to).toEqual(['new.user@acme.vn']);
    expect(received[0].body).toContain('https://app.acme.test/activate-account#token=deliver-me');
    const row = await rowOf(mail.id);
    expect(row).toMatchObject({ status: 'SENT', attempts: 1, payload_ciphertext: null, lease_id: null });
    expect(row.sent_at).toBeInstanceOf(Date);
  });

  it('cancels instead of sending when the token is no longer usable', async () => {
    const mail = await enqueue('revoked-before-send');

    await dispatcher.dispatchDue(() => Promise.resolve(false));

    expect(received).toHaveLength(0);
    expect(await rowOf(mail.id)).toMatchObject({ status: 'CANCELLED', payload_ciphertext: null });
  });

  it('retries a transient SMTP failure later, then delivers', async () => {
    mode = 'transient';
    const mail = await enqueue();

    await dispatcher.dispatchDue(usableAlways);
    const afterFailure = await rowOf(mail.id);
    expect(afterFailure).toMatchObject({ status: 'PENDING', attempts: 1, lease_id: null });
    expect((afterFailure.next_attempt_at as Date).getTime()).toBeGreaterThan(Date.now());
    expect(afterFailure.last_error_code).toEqual(expect.any(String));
    expect(await dispatcher.dispatchDue(usableAlways)).toBe(0);

    mode = 'ok';
    await ctx.sql.query("UPDATE email_outbox SET next_attempt_at = now() - interval '1 second' WHERE id = $1", [
      mail.id,
    ]);
    expect(await dispatcher.dispatchDue(usableAlways)).toBe(1);
    expect(await rowOf(mail.id)).toMatchObject({ status: 'SENT', attempts: 2 });
  });

  it('fails permanently on a 5xx answer without retrying', async () => {
    mode = 'permanent';
    const mail = await enqueue();

    await dispatcher.dispatchDue(usableAlways);

    expect(await rowOf(mail.id)).toMatchObject({ status: 'FAILED', attempts: 1, payload_ciphertext: null });
  });

  it('fails after the fifth transient attempt', async () => {
    mode = 'transient';
    const mail = await enqueue();
    await ctx.sql.query('UPDATE email_outbox SET attempts = 4 WHERE id = $1', [mail.id]);

    await dispatcher.dispatchDue(usableAlways);

    expect(await rowOf(mail.id)).toMatchObject({ status: 'FAILED', attempts: 5, payload_ciphertext: null });
  });

  it('reclaims a SENDING row whose lease has expired, and leaves a live lease alone', async () => {
    const stale = await enqueue();
    const live = await enqueue();
    await ctx.sql.query(
      "UPDATE email_outbox SET status = 'SENDING', lease_id = $2, lease_expires_at = now() - interval '1 minute' WHERE id = $1",
      [stale.id, randomUUID()],
    );
    await ctx.sql.query(
      "UPDATE email_outbox SET status = 'SENDING', lease_id = $2, lease_expires_at = now() + interval '5 minutes' WHERE id = $1",
      [live.id, randomUUID()],
    );

    expect(await dispatcher.dispatchDue(usableAlways)).toBe(1);

    expect(await rowOf(stale.id)).toMatchObject({ status: 'SENT' });
    expect(await rowOf(live.id)).toMatchObject({ status: 'SENDING' });
  });

  it('does not send a row whose lease another dispatcher took over while this batch was still running', async () => {
    const one = await enqueue('batch-one');
    const two = await enqueue('batch-two');
    let stolenId: string | undefined;
    let handledFirst: string | undefined;

    await dispatcher.dispatchDue(async (hash) => {
      // The claim returns rows in no promised order. Whichever row is handled first, a second worker
      // re-claims the other one meanwhile (its lease ran out).
      if (stolenId === undefined) {
        handledFirst = hash;
        stolenId = hash === one.hash ? two.id : one.id;
        await ctx.sql.query('UPDATE email_outbox SET lease_id = $2 WHERE id = $1', [stolenId, randomUUID()]);
      }
      return true;
    });

    expect(received).toHaveLength(1);
    expect(received[0].body).toContain(handledFirst === one.hash ? 'batch-one' : 'batch-two');
    expect(await rowOf(stolenId as string)).toMatchObject({ status: 'SENDING' });
  });

  it('does not send one message twice when two dispatchers run at once (SKIP LOCKED)', async () => {
    await enqueue('only-once');

    const counts = await Promise.all([dispatcher.dispatchDue(usableAlways), dispatcher.dispatchDue(usableAlways)]);

    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(received).toHaveLength(1);
  });

  it('cancels only pending mail for the given tokens and wipes its payload', async () => {
    const pending = await enqueue('cancel-me');
    const sent = await enqueue('already-sent');
    await ctx.sql.query("UPDATE email_outbox SET status = 'SENT', payload_ciphertext = NULL WHERE id = $1", [sent.id]);

    await runner.run((tx) => notifications.cancelPendingForTokens(tx, [pending.hash, sent.hash]));

    expect(await rowOf(pending.id)).toMatchObject({ status: 'CANCELLED', payload_ciphertext: null });
    expect(await rowOf(sent.id)).toMatchObject({ status: 'SENT' });
  });

  describe('a notice that carries no link (AC-12)', () => {
    const enqueueNotice = (recipient = 'stored.login@acme.vn') =>
      runner.run((tx) =>
        notifications.enqueueEmail(tx, {
          organizationId: seed.organizationId,
          recipient,
          template: 'PASSWORD_CHANGED_NOTICE',
          locale: 'en',
          actionTokenHash: null,
          payload: { event: 'PASSWORD_RESET', at: '2026-10-16T09:00:00.000Z', fullName: 'Stored Login' },
        }),
      );

    it('lets several notices coexist, because only a real token hash is unique', async () => {
      const first = await enqueueNotice();
      const second = await enqueueNotice();

      expect(first.id).not.toEqual(second.id);
      expect(await rowOf(first.id)).toMatchObject({ action_token_hash: null, status: 'PENDING' });
      expect(await rowOf(second.id)).toMatchObject({ action_token_hash: null, status: 'PENDING' });
    });

    it('is sent without ever asking whether a link is usable, and the mail holds no link', async () => {
      const notice = await enqueueNotice();
      const asked: string[] = [];

      await dispatcher.dispatchDue((hash) => {
        asked.push(hash);
        return Promise.resolve(false);
      });

      expect(asked).toEqual([]);
      expect(received).toHaveLength(1);
      expect(received[0].to).toEqual(['stored.login@acme.vn']);
      expect(received[0].body).toContain('2026-10-16T09:00:00.000Z');
      expect(received[0].body).not.toContain('#token=');
      expect(await rowOf(notice.id)).toMatchObject({ status: 'SENT', payload_ciphertext: null });
    });

    it('is not touched when pending mail for tokens is cancelled', async () => {
      const notice = await enqueueNotice();
      const withLink = await enqueue('cancel-this-one');

      await runner.run((tx) => notifications.cancelPendingForTokens(tx, [withLink.hash]));

      expect(await rowOf(withLink.id)).toMatchObject({ status: 'CANCELLED' });
      expect(await rowOf(notice.id)).toMatchObject({ status: 'PENDING' });
    });
  });

  it('fails a row whose template this build does not know, once, instead of retrying it for ever', async () => {
    const mail = await enqueue();
    await ctx.sql.query("UPDATE email_outbox SET template = 'FROM_A_FUTURE_BUILD' WHERE id = $1", [mail.id]);

    await dispatcher.dispatchDue(usableAlways);

    expect(received).toHaveLength(0);
    expect(await rowOf(mail.id)).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      last_error_code: 'TEMPLATE_UNKNOWN',
      payload_ciphertext: null,
    });
    expect(await dispatcher.dispatchDue(usableAlways)).toBe(0);
  });

  it('reports delivery state per token for the account detail view', async () => {
    const mail = await enqueue('state');

    const states = await notifications.deliveryStates([mail.hash, 'hash-unknown']);

    expect(states.get(mail.hash)).toMatchObject({ status: 'PENDING', attempts: 0, lastErrorCode: null });
    expect(states.has('hash-unknown')).toBe(false);
  });
});
