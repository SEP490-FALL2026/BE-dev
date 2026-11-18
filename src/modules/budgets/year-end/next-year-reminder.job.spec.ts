import { Logger } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { NextYearReminderSweeper } from './next-year-reminder.job';

/** The first pass waits five minutes; every sweeper job of the API (`*.job.ts`) has this shape and logs a failed pass the same way. */
const FIRST_PASS_AFTER_MS = 5 * 60 * 1000;

describe('NextYearReminderSweeper (when it runs and what a failed pass writes to the log)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function runWith(noticeDue: jest.Mock): Promise<jest.SpyInstance> {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sweeper = new NextYearReminderSweeper({ noticeDue } as never);

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(FIRST_PASS_AFTER_MS);
    void sweeper.onModuleDestroy();

    return logged;
  }

  it('asks nothing before five minutes have passed, and then asks once', async () => {
    const noticeDue = jest.fn().mockResolvedValue({ notices: 0 });
    const sweeper = new NextYearReminderSweeper({ noticeDue } as never);

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(FIRST_PASS_AFTER_MS - 1);
    expect(noticeDue).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(noticeDue).toHaveBeenCalledTimes(1);
    void sweeper.onModuleDestroy();
  });

  it('logs what kind of error it was and that it cannot be retried, with the frames and without the message', async () => {
    const logged = await runWith(jest.fn().mockRejectedValue(new TypeError('postgresql://user:s3cr3t@db/x')));

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      'Next year budget reminder pass failed: TypeError retryable=false',
      expect.stringMatching(/^\s+at /),
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain('s3cr3t');
  });

  it('logs a database that was only unavailable as retryable, with its SQLSTATE and no trace', async () => {
    const logged = await runWith(
      jest.fn().mockRejectedValue(new TransientDatabaseError('40P01', new Error('deadlock detected'))),
    );

    expect(logged).toHaveBeenCalledWith(
      'Next year budget reminder pass failed: TransientDatabaseError sqlState=40P01 retryable=true cause=Error',
      undefined,
    );
  });
});
