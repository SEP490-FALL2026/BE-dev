import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { AccountLockOverdueService } from './account-lock-overdue.service';
import { BlockAnnouncementService } from './block-announcement.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour announces the block moment of each departure whose person is refused from today or earlier and was never announced
 * (`BlockAnnouncementService`), then tells that the lock of the company account of a departure blocked now is late
 * (`AccountLockOverdueService`). Both write once for a case, so the hourly pass and every instance that runs it are safe; a work that fails as a
 * whole only logs, the other still runs in the same pass, and the next pass tries again. The timer never keeps the process alive.
 */
@Injectable()
export class BlockMomentSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BlockMomentSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly announcement: BlockAnnouncementService,
    private readonly lockOverdue: AccountLockOverdueService,
  ) {}

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule(FIRST_SWEEP_AFTER_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.sweep();
    }, delayMs);
    this.timer.unref();
  }

  private async sweep(): Promise<void> {
    try {
      // The two works are independent: one that fails as a whole (a page that cannot be read) never takes the other with it for the hour.
      await this.run('Block moment announcement', async () => {
        const announced = await this.announcement.announce();
        if (announced.announced > 0) this.logger.log(`Announced the block of ${announced.announced} departure(s)`);
      });
      await this.run('Account lock overdue telling', async () => {
        const overdue = await this.lockOverdue.notice();
        if (overdue.told > 0) this.logger.log(`Told ${overdue.told} departure(s) whose account lock is late`);
      });
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }

  /** Runs one of the works of the pass; a failure only logs, so the next work and the next pass still run. */
  private async run(name: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(`${name} failed: ${describeForOperator(error)}`, traceForOperator(error));
    }
  }
}
