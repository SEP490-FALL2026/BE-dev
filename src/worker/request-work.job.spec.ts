import { Logger } from '@nestjs/common';
import { TransientDatabaseError } from '../infrastructure/database/transaction-runner';
import { RequestWorkLoop } from './request-work.job';

describe('RequestWorkLoop', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function build(
    sweep: jest.Mock,
    intervalMs = 1000,
    project: jest.Mock = jest.fn().mockResolvedValue({}),
    remind: jest.Mock = jest.fn().mockResolvedValue({}),
  ) {
    const config = { get: jest.fn().mockReturnValue(intervalMs) };
    const loop = new RequestWorkLoop(
      { sweep } as never,
      { sweep: remind } as never,
      { project } as never,
      config as never,
    );

    return { loop, config, project, remind };
  }

  it('sweeps at once and then once per REQUEST_WORK_INTERVAL_MS', async () => {
    const sweep = jest.fn().mockResolvedValue({});
    const { loop, config } = build(sweep, 2500);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2499);
    expect(sweep).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(sweep).toHaveBeenCalledTimes(2);

    expect(config.get).toHaveBeenCalledWith('REQUEST_WORK_INTERVAL_MS', { infer: true });
    void loop.onModuleDestroy();
  });

  it('reminds the late steps and then projects the audit events into the inbox in the same tick, after the sweep', async () => {
    const order: string[] = [];
    const sweep = jest.fn().mockImplementation(() => Promise.resolve(order.push('sweep')));
    const remind = jest.fn().mockImplementation(() => Promise.resolve(order.push('remind')));
    const project = jest.fn().mockImplementation(() => Promise.resolve(order.push('project')));
    const { loop } = build(sweep, 1000, project, remind);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['sweep', 'remind', 'project']);
    await jest.advanceTimersByTimeAsync(1000);
    expect(order).toEqual(['sweep', 'remind', 'project', 'sweep', 'remind', 'project']);
    void loop.onModuleDestroy();
  });

  it('runs the reminders and the projection even when the reminders failed, and logs the failure by its name only', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const remind = jest.fn().mockRejectedValueOnce(new SyntaxError('postgresql://u:s3cr3t@db/x')).mockResolvedValue({});
    const project = jest.fn().mockResolvedValue({});
    const { loop } = build(jest.fn().mockResolvedValue({}), 1000, project, remind);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(project).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(remind).toHaveBeenCalledTimes(2);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      'Step reminders failed: SyntaxError retryable=false',
      expect.stringMatching(/^\s+at /),
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain('s3cr3t');
    logged.mockRestore();
    void loop.onModuleDestroy();
  });

  it('logs a database that was only unavailable as retryable, with its SQLSTATE and no trace, and runs the next piece', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const remind = jest
      .fn()
      .mockRejectedValueOnce(new TransientDatabaseError('40P01', new Error('deadlock')))
      .mockResolvedValue({});
    const project = jest.fn().mockResolvedValue({});
    const { loop } = build(jest.fn().mockResolvedValue({}), 1000, project, remind);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);

    expect(project).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      'Step reminders failed: TransientDatabaseError sqlState=40P01 retryable=true cause=Error',
      undefined,
    );
    logged.mockRestore();
    void loop.onModuleDestroy();
  });

  it('never starts a tick while the previous one is still running', async () => {
    let release: () => void = () => undefined;
    const sweep = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { loop } = build(sweep, 1000);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(5000);
    expect(sweep).toHaveBeenCalledTimes(1);

    release();
    await jest.advanceTimersByTimeAsync(1000);
    expect(sweep).toHaveBeenCalledTimes(2);
    release();
    void loop.onModuleDestroy();
  });

  it('logs a failed tick by the error name only, never its message, and keeps going', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sweep = jest.fn().mockRejectedValueOnce(new TypeError('postgresql://user:s3cr3t@db/x')).mockResolvedValue({});
    const { loop } = build(sweep);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(1000);

    expect(logged).toHaveBeenCalledWith(
      'Request work tick failed: TypeError retryable=false',
      expect.stringMatching(/^\s+at /),
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain('s3cr3t');
    expect(sweep).toHaveBeenCalledTimes(2);
    logged.mockRestore();
    void loop.onModuleDestroy();
  });

  it('projects even when the sweep failed, and sweeps even when the projection failed, each logged by its own name', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sweep = jest.fn().mockRejectedValueOnce(new TypeError('sweep detail')).mockResolvedValue({});
    const project = jest.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new RangeError('project detail'));
    const { loop } = build(sweep, 1000, project);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(project).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(project).toHaveBeenCalledTimes(2);

    expect(logged).toHaveBeenCalledWith(
      'Request work tick failed: TypeError retryable=false',
      expect.stringMatching(/^\s+at /),
    );
    expect(logged).toHaveBeenCalledWith(
      'Request status projection failed: RangeError retryable=false',
      expect.stringMatching(/^\s+at /),
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain('detail');
    logged.mockRestore();
    void loop.onModuleDestroy();
  });

  it('stops on shutdown after waiting for the tick in progress', async () => {
    const sweep = jest.fn().mockResolvedValue({});
    const { loop } = build(sweep);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);

    await loop.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(5000);
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});
