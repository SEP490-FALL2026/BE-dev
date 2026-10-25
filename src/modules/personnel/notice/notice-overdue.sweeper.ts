import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { NoticeOverdueService } from './notice-overdue.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour tells, one time for each notice, that its day has passed and it still waits for the IT Admin. Each instance runs it;
 * the mark of the notice makes that safe, and a failed pass only logs. It never changes a notice or a person. The timer never keeps
 * the process alive.
 */
@Injectable()
export class NoticeOverdueSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NoticeOverdueSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly overdue: NoticeOverdueService) {}

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
      if (told > 0) this.logger.log(`Told ${told} notice(s) of department heads past their day`);
    } catch (error) {
      this.logger.error(`Notice overdue sweep failed: ${(error as Error).name}`);
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
