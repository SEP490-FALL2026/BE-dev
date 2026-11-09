import { Logger } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { YearStartCommitmentsSweeper } from './year-start-commitments.job';

/** The first sweep waits five minutes; every sweeper job of the API (`*.job.ts`) has this shape and logs a failed pass the same way. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

describe('YearStartCommitmentsSweeper (BR-MF1-09e: the pass of 01/01 is tried every hour, and a failed pass only logs)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('BR-MF1-09e: runs the first pass five minutes after the start and one every hour, with the time of the pass', async () => {
    const run = jest.fn<Promise<unknown>, [Date]>().mockResolvedValue({ status: 'ALREADY_DONE', year: 2027 });
    const sweeper = new YearStartCommitmentsSweeper({ run } as never);

    sweeper.onApplicationBootstrap();
    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(FIRST_SWEEP_AFTER_MS);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toBeInstanceOf(Date);
    await jest.advanceTimersByTimeAsync(SWEEP_EVERY_MS);
    expect(run).toHaveBeenCalledTimes(2);
    await sweeper.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(SWEEP_EVERY_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('BR-MF1-09e: logs what a pass that made commitments did', async () => {
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const run = jest
      .fn()
      .mockResolvedValue({ status: 'COMPLETED', year: 2027, created: 4, skipped: 1, reported: true });
    const sweeper = new YearStartCommitmentsSweeper({ run } as never);

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(FIRST_SWEEP_AFTER_MS);
    await sweeper.onModuleDestroy();

    expect(info).toHaveBeenCalledWith(expect.stringContaining('4 commitment(s) for 2027'));
  });

  async function failWith(error: unknown): Promise<jest.SpyInstance> {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sweeper = new YearStartCommitmentsSweeper({ run: jest.fn().mockRejectedValue(error) } as never);

    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(FIRST_SWEEP_AFTER_MS);
    void sweeper.onModuleDestroy();

    return logged;
  }

  it('BR-MF1-09e: a failed pass logs what kind of error it was, with the frames and without the message, and is tried again at the next hour', async () => {
    const logged = await failWith(new TypeError('postgresql://user:s3cr3t@db/x'));

    expect(logged).toHaveBeenCalledWith(
      'Year-start commitments sweep failed: TypeError retryable=false',
      expect.stringMatching(/^\s+at /),
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain('s3cr3t');
  });

  it('BR-MF1-09e: a database that was only unavailable is logged as retryable, with its SQLSTATE and no trace', async () => {
    const logged = await failWith(new TransientDatabaseError('40P01', new Error('deadlock detected')));

    expect(logged).toHaveBeenCalledWith(
      'Year-start commitments sweep failed: TransientDatabaseError sqlState=40P01 retryable=true cause=Error',
      undefined,
    );
  });
});
