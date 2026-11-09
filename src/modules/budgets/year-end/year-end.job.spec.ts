import { Logger } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { BudgetYearEndSweeper } from './year-end.job';

/** The first sweep waits five minutes; every sweeper job of the API (`*.job.ts`) has this shape and logs a failed pass the same way. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;

describe('BudgetYearEndSweeper (what a failed pass writes to the log)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function failWith(error: unknown): Promise<jest.SpyInstance> {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sweeper = new BudgetYearEndSweeper({ closeEndedYears: jest.fn().mockRejectedValue(error) } as never);

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(FIRST_SWEEP_AFTER_MS);
    void sweeper.onModuleDestroy();

    return logged;
  }

  afterEach(() => jest.restoreAllMocks());

  it('logs what kind of error it was and that it cannot be retried, with the frames and without the message', async () => {
    const logged = await failWith(new TypeError('postgresql://user:s3cr3t@db/x'));

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      'Budget year-end sweep failed: TypeError retryable=false',
      expect.stringMatching(/^\s+at /),
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain('s3cr3t');
  });

  it('logs a database that was only unavailable as retryable, with its SQLSTATE and no trace', async () => {
    const logged = await failWith(new TransientDatabaseError('40P01', new Error('deadlock detected')));

    expect(logged).toHaveBeenCalledWith(
      'Budget year-end sweep failed: TransientDatabaseError sqlState=40P01 retryable=true cause=Error',
      undefined,
    );
  });
});
