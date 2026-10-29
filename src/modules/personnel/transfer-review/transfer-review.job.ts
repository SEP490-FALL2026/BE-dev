import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { TransferReviewOverdueService } from './transfer-review-overdue.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour tells, one time for each review, that its deadline passed without every tool decided. Each instance runs it; the mark
 * of the review makes that safe, and a failed pass only logs. The timer never keeps the process alive.
 */
@Injectable()
export class TransferReviewSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TransferReviewSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly overdue: TransferReviewOverdueService) {}

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
      const told = await this.overdue.noticeOverdue();
      if (told > 0) this.logger.log(`Told ${told} transfer review(s) past their deadline`);
    } catch (error) {
      this.logger.error(`Transfer review overdue sweep failed: ${(error as Error).name}`);
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
