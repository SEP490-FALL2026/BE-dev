import type { SMTPServer } from 'smtp-server';

/**
 * The complete SMTP configuration of an in-process fake server (H7-VRF-01). It names every key the mail transport reads,
 * so neither a developer's shell nor a `.env` can add authentication, TLS or another host to a test run: a suite sets all
 * of them and restores `process.env` afterwards. Nothing here asserts.
 */
export function fakeSmtpEnvironment(port: number): Record<string, string> {
  return {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(port),
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    SMTP_TLS: 'false',
    SMTP_FROM: 'no-reply@localhost',
  };
}

/** Listens on a free loopback port and resolves it. */
export function listenOnLoopback(server: SMTPServer): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.server.address() as { port: number }).port));
  });
}
