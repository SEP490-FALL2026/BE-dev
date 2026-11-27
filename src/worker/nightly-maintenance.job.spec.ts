import type { QueueProducers } from '../infrastructure/queue/queue-producers';
import type { QueueWorkerFactory } from '../infrastructure/queue/queue-worker-factory';
import { BOOT_RUN_DEDUP, NightlyMaintenanceScheduler, nextMidnightInVietnam } from './nightly-maintenance.job';
import type { NightlyMaintenanceRunner } from './nightly-maintenance.runner';
import { NightlyMaintenanceTimer } from './nightly-maintenance.timer';

describe('the maintenance scheduler', () => {
  afterEach(() => jest.useRealTimers());

  it.each([
    ['2026-11-27T16:59:00Z', '2026-11-27T17:00:00.000Z'],
    ['2026-11-27T17:00:01Z', '2026-11-28T17:00:00.000Z'],
    ['2026-12-31T18:00:00Z', '2027-01-01T17:00:00.000Z'],
  ])('finds the next Vietnam midnight from %s', (now, midnight) => {
    expect(nextMidnightInVietnam(new Date(now)).toISOString()).toBe(midnight);
  });

  it('retries a failed upsert in the background, creates the worker, then enqueues the boot run', async () => {
    jest.useFakeTimers();
    const sequence: string[] = [];
    const queue = {
      upsertJobScheduler: jest
        .fn()
        .mockRejectedValueOnce(new Error('Connection is closed.'))
        .mockImplementation(() => {
          sequence.push('upsert');
          return Promise.resolve();
        }),
      add: jest.fn().mockImplementation(() => {
        sequence.push('add');
        return Promise.resolve();
      }),
    };
    const close = jest.fn().mockResolvedValue(undefined);
    const workers = {
      create: jest.fn().mockImplementation(() => {
        sequence.push('worker');
        return {};
      }),
      run: jest.fn().mockResolvedValue(undefined),
      close,
    };
    const producers = { get: () => queue };
    const job = new NightlyMaintenanceScheduler(
      producers as unknown as QueueProducers,
      workers as unknown as QueueWorkerFactory,
      {} as NightlyMaintenanceRunner,
      { bootDelayMs: 20, retryDelayMs: 30_000 },
    );

    expect(job.onApplicationBootstrap()).toBeUndefined();
    await jest.advanceTimersByTimeAsync(29_999);
    expect(workers.create).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(sequence).toEqual(['upsert', 'worker']);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'nightly-maintenance',
      { pattern: '0 0 * * *', tz: 'Asia/Ho_Chi_Minh' },
      {
        name: 'run',
        data: {},
        opts: {
          attempts: 1,
          stackTraceLimit: 0,
          removeOnComplete: { age: 2_592_000, count: 60 },
          removeOnFail: { age: 2_592_000, count: 60 },
        },
      },
    );
    await jest.advanceTimersByTimeAsync(20);
    expect(sequence).toEqual(['upsert', 'worker', 'add']);
    expect(queue.add).toHaveBeenCalledWith(
      'run',
      {},
      {
        attempts: 1,
        stackTraceLimit: 0,
        deduplication: BOOT_RUN_DEDUP,
        removeOnComplete: { age: 2_592_000, count: 60 },
        removeOnFail: { age: 2_592_000, count: 60 },
      },
    );
    await job.onModuleDestroy();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('runs the poll transport at boot and next midnight, and cancels its timer on shutdown', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T16:59:00Z') });
    const runner = { run: jest.fn().mockResolvedValue({ tasks: [] }) };
    const timer = new NightlyMaintenanceTimer(runner as unknown as NightlyMaintenanceRunner, {
      bootDelayMs: 20,
      retryDelayMs: 30_000,
    });
    timer.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(20);
    expect(runner.run.mock.calls).toEqual([[new Date('2026-11-27T16:59:00.020Z')]]);
    await jest.advanceTimersByTimeAsync(59_980);
    expect(runner.run.mock.calls[1]).toEqual([new Date('2026-11-27T17:00:00Z')]);
    await timer.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
