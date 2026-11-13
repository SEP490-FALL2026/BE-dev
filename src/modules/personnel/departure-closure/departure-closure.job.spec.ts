import { Logger } from '@nestjs/common';
import { DepartureClosureSweeper } from './departure-closure.job';
import type { DepartureClosureService } from './departure-closure.service';
import type { MailboxLockSettlement } from './mailbox-lock-settlement.service';

/** The two works of the hourly pass, each of which can fail on its own. */
function sweeperOf(works: { settle: () => Promise<unknown>; close: () => Promise<unknown> }) {
  const order: string[] = [];
  const settle = jest.fn(() => {
    order.push('settle');

    return works.settle();
  });
  const sweep = jest.fn(() => {
    order.push('close');

    return works.close();
  });
  const sweeper = new DepartureClosureSweeper(
    { settle } as unknown as MailboxLockSettlement,
    { sweep } as unknown as DepartureClosureService,
  );
  const pass = () => (sweeper as unknown as { sweep: () => Promise<void> }).sweep();

  return { sweeper, pass, settle, sweep, order };
}

describe('the hourly pass that settles the lock of the mailbox and closes the departures (QĐ-110e, D-72)', () => {
  let logged: jest.SpyInstance;

  beforeEach(() => {
    logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('writes the lock of the mailbox first and closes after, since the closing may wait for the lock', async () => {
    const { sweeper, pass, order } = sweeperOf({
      settle: () => Promise.resolve({ written: 1, failed: 0 }),
      close: () => Promise.resolve({ closed: 1, failed: 0 }),
    });

    await pass();
    await sweeper.onModuleDestroy();

    expect(order).toEqual(['settle', 'close']);
    expect(logged).not.toHaveBeenCalled();
  });

  it('still closes the departures when the settling failed as a whole, and still settles when the closing failed', async () => {
    const settleFails = sweeperOf({
      settle: () => Promise.reject(new Error('the database refused the page')),
      close: () => Promise.resolve({ closed: 0, failed: 0 }),
    });
    const closeFails = sweeperOf({
      settle: () => Promise.resolve({ written: 0, failed: 0 }),
      close: () => Promise.reject(new Error('the database refused the page')),
    });

    await settleFails.pass();
    await closeFails.pass();
    await settleFails.sweeper.onModuleDestroy();
    await closeFails.sweeper.onModuleDestroy();

    expect(settleFails.sweep).toHaveBeenCalledTimes(1);
    expect(closeFails.settle).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it('logs both failures when both works fail, and still schedules the next pass', async () => {
    const { sweeper, pass } = sweeperOf({
      settle: () => Promise.reject(new Error('one')),
      close: () => Promise.reject(new Error('two')),
    });

    await pass();

    expect(logged).toHaveBeenCalledTimes(2);
    expect((sweeper as unknown as { timer: unknown }).timer).toBeDefined();
    await sweeper.onModuleDestroy();
  });
});
