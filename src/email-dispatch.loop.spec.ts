import { EmailDispatchLoop } from './email-dispatch.loop';

describe('EmailDispatchLoop', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function build(dispatchDue: jest.Mock) {
    const config = { get: () => 1000 };
    const identity = { isActionLinkUsable: jest.fn().mockResolvedValue(true) };
    const loop = new EmailDispatchLoop({ dispatchDue } as never, identity as never, config as never);

    return { loop, identity };
  }

  it('dispatches immediately and then once per interval until the application shuts down', async () => {
    const dispatchDue = jest.fn().mockResolvedValue(0);
    const { loop } = build(dispatchDue);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(dispatchDue).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(3000);
    expect(dispatchDue).toHaveBeenCalledTimes(4);

    void loop.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(5000);
    expect(dispatchDue).toHaveBeenCalledTimes(4);
  });

  it('keeps going after a tick fails', async () => {
    const dispatchDue = jest.fn().mockRejectedValueOnce(new Error('database down')).mockResolvedValue(0);
    const { loop } = build(dispatchDue);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(2000);

    expect(dispatchDue.mock.calls.length).toBeGreaterThanOrEqual(2);
    void loop.onModuleDestroy();
  });

  it('hands the dispatcher the account module answer to whether a link still works', async () => {
    const dispatchDue = jest.fn().mockImplementation((isUsable: (hash: string) => Promise<boolean>) => isUsable('h1'));
    const { loop, identity } = build(dispatchDue);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);

    expect(identity.isActionLinkUsable).toHaveBeenCalledWith('h1');
    void loop.onModuleDestroy();
  });

  it('does not start a second tick while one is still running', async () => {
    let release: () => void = () => undefined;
    const dispatchDue = jest
      .fn()
      .mockImplementation(() => new Promise<number>((resolve) => (release = () => resolve(0))));
    const { loop } = build(dispatchDue);

    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(5000);
    expect(dispatchDue).toHaveBeenCalledTimes(1);

    release();
    await jest.advanceTimersByTimeAsync(1000);
    expect(dispatchDue).toHaveBeenCalledTimes(2);
    void loop.onModuleDestroy();
  });

  it('waits for the tick in progress when the module is destroyed, and starts no further tick', async () => {
    let release: () => void = () => undefined;
    const dispatchDue = jest
      .fn()
      .mockImplementation(() => new Promise<number>((resolve) => (release = () => resolve(0))));
    const { loop } = build(dispatchDue);
    loop.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);

    let stopped = false;
    const stopping = loop.onModuleDestroy().then(() => (stopped = true));
    await jest.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);

    release();
    await stopping;
    await jest.advanceTimersByTimeAsync(5000);
    expect(dispatchDue).toHaveBeenCalledTimes(1);
  });
});
