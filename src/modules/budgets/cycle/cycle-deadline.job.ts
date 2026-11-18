import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { CycleDeadlineService } from './cycle-deadline.service';

/** The first pass waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_PASS_AFTER_MS = 5 * 60 * 1000;
const PASS_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour tells the deadlines of the budget cycles (`R-I05`): see `CycleDeadlineService`. Each instance runs it; a notice carries
 * its own event key, so two instances, or a pass run again, write each notice once, and a failed pass only logs. The timer never
 * keeps the process alive. It stays in the API process, like the closure of the year.
 */
@Injectable()
export class CycleDeadlineSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CycleDeadlineSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly deadlines: CycleDeadlineService) {}

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule(FIRST_PASS_AFTER_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.pass();
    }, delayMs);
    this.timer.unref();
  }

  private async pass(): Promise<void> {
    try {
      const done = await this.deadlines.run();
      if (done.notices > 0) this.logger.log(`Told ${done.notices} budget deadline notice(s)`);
    } catch (error) {
      this.logger.error(`Budget deadline pass failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(PASS_EVERY_MS);
    }
  }
}
