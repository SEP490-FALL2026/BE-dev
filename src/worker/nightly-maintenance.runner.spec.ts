import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../infrastructure/config/env-schema';
import * as locks from '../infrastructure/database/session-advisory-lock';
import type { AuthHousekeepingApi } from '../modules/identity-access/public/auth-housekeeping.api';
import type { EmailDeliveryApi } from '../modules/notifications/public/email-delivery.api';
import { NightlyMaintenanceRunner } from './nightly-maintenance.runner';

function fixture() {
  const email = { purgeFinished: jest.fn().mockResolvedValue(0) };
  const auth = {
    purgeDeadSessionTokens: jest.fn().mockResolvedValue(0),
    purgeDeadSessions: jest.fn().mockResolvedValue(0),
    purgeSpentActionTokens: jest.fn().mockResolvedValue(0),
    purgeIdleLoginThrottles: jest.fn().mockResolvedValue(0),
  };
  const config = new ConfigService<EnvironmentVariables, true>({ DATABASE_URL: 'postgresql://unused' });
  return {
    email,
    auth,
    runner: new NightlyMaintenanceRunner(
      email as unknown as EmailDeliveryApi,
      auth as unknown as AuthHousekeepingApi,
      config,
    ),
  };
}

describe('nightly maintenance runner', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses three batches for 1,200 rows and keeps running subsequent tasks after a failure', async () => {
    const { runner, email, auth } = fixture();
    const release = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(locks, 'trySessionAdvisoryLock').mockResolvedValue({ release });
    email.purgeFinished.mockResolvedValueOnce(500).mockResolvedValueOnce(500).mockResolvedValueOnce(200);
    auth.purgeDeadSessionTokens.mockRejectedValue(new Error('Cannot reach fixture.user@example.test'));
    auth.purgeSpentActionTokens.mockResolvedValue(2);
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const report = await runner.run(new Date('2026-11-27T17:00:00.000Z'));
    expect(report).toEqual({
      tasks: [
        { name: 'finished-email', deleted: 1_200, moreRemain: false, failed: false },
        { name: 'dead-sessions', deleted: 0, moreRemain: false, failed: true },
        { name: 'spent-action-tokens', deleted: 2, moreRemain: false, failed: false },
        { name: 'idle-login-throttles', deleted: 0, moreRemain: false, failed: false },
      ],
    });
    expect(email.purgeFinished).toHaveBeenCalledTimes(3);
    expect(auth.purgeDeadSessions).not.toHaveBeenCalled();
    expect(auth.purgeSpentActionTokens).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(info.mock.calls)).toContain('deleted 1200');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('fixture.user@example.test');
  });

  it('does nothing when another worker has the database lock', async () => {
    const { runner, email, auth } = fixture();
    jest.spyOn(locks, 'trySessionAdvisoryLock').mockResolvedValue(null);
    await expect(runner.run(new Date())).resolves.toBe('BUSY');
    expect(email.purgeFinished).not.toHaveBeenCalled();
    expect(auth.purgeDeadSessionTokens).not.toHaveBeenCalled();
  });

  it('stops each task at fifty batches and reports work remaining', async () => {
    const { runner, email } = fixture();
    jest.spyOn(locks, 'trySessionAdvisoryLock').mockResolvedValue({ release: jest.fn().mockResolvedValue(undefined) });
    email.purgeFinished.mockResolvedValue(500);
    const report = await runner.run(new Date());
    expect(email.purgeFinished).toHaveBeenCalledTimes(50);
    if (report === 'BUSY') throw new Error('Fixture unexpectedly reported BUSY');
    expect(report.tasks[0]).toEqual({ name: 'finished-email', deleted: 25_000, moreRemain: true, failed: false });
  });
});
