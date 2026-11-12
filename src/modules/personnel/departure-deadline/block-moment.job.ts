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
 * (`AccountLockOverdueService`). Both write once for a case, so the hourly pass and every instance that runs it are safe; a failed pass only
 * logs and the next one tries again. The timer never keeps the process alive.
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
      const announced = await this.announcement.announce();
      if (announced.announced > 0) this.logger.log(`Announced the block of ${announced.announced} departure(s)`);
      const overdue = await this.lockOverdue.notice();
      if (overdue.told > 0) this.logger.log(`Told ${overdue.told} departure(s) whose account lock is late`);
    } catch (error) {
      this.logger.error(`Block moment sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
