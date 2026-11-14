import { Logger } from '@nestjs/common';
import type { AccountLockOverdueService } from './account-lock-overdue.service';
import type { BlockAnnouncementService } from './block-announcement.service';
import { BlockMomentSweeper } from './block-moment.job';

/** The two works of the hourly pass, each of which can fail on its own. */
function sweeperOf(works: { announce: () => Promise<unknown>; notice: () => Promise<unknown> }) {
  const announce = jest.fn(works.announce);
  const notice = jest.fn(works.notice);
  const sweeper = new BlockMomentSweeper(
    { announce } as unknown as BlockAnnouncementService,
    { notice } as unknown as AccountLockOverdueService,
  );
  const sweep = () => (sweeper as unknown as { sweep: () => Promise<void> }).sweep();

  return { sweeper, sweep, announce, notice };
}

describe('the hourly pass of the block moment (QĐ-110b, QĐ-110d, R-1)', () => {
  let logged: jest.SpyInstance;

  beforeEach(() => {
    logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('tells the late lock of the account although the announcement of the block failed as a whole: the two works do not depend on each other', async () => {
    const { sweeper, sweep, announce, notice } = sweeperOf({
      announce: () => Promise.reject(new Error('the database refused the page')),
      notice: () => Promise.resolve({ told: 2, failed: 0 }),
    });

    await sweep();
    await sweeper.onModuleDestroy();

    expect(announce).toHaveBeenCalledTimes(1);
    expect(notice).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('announces the block although the telling of the late lock failed, and logs each failure once', async () => {
    const { sweeper, sweep, announce, notice } = sweeperOf({
      announce: () => Promise.resolve({ announced: 1, failed: 0 }),
      notice: () => Promise.reject(new Error('the database refused the page')),
    });

    await sweep();
    await sweeper.onModuleDestroy();

    expect(announce).toHaveBeenCalledTimes(1);
    expect(notice).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('logs both failures when both works fail, and still schedules the next pass', async () => {
    const { sweeper, sweep } = sweeperOf({
      announce: () => Promise.reject(new Error('one')),
      notice: () => Promise.reject(new Error('two')),
    });

    await sweep();

    expect(logged).toHaveBeenCalledTimes(2);
    expect((sweeper as unknown as { timer: unknown }).timer).toBeDefined();
    await sweeper.onModuleDestroy();
  });
});
