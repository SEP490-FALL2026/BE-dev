import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { LeaveOverdueService } from './leave-overdue.service';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour tells, one time for each approved day of return, that a person on long leave is not back on it. Each instance runs it;
 * the mark of the leave makes that safe, and a failed pass only logs. It never changes the state of a person. The timer never keeps
 * the process alive.
 */
@Injectable()
export class LeaveReturnSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LeaveReturnSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly overdue: LeaveOverdueService) {}

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
      if (told > 0) this.logger.log(`Told ${told} long leave(s) past their day of return`);
    } catch (error) {
      this.logger.error(`Long leave return sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
