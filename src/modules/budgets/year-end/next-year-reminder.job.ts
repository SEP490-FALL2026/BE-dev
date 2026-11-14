import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { NextYearReminderService } from './next-year-reminder.service';

/** The first pass waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_PASS_AFTER_MS = 5 * 60 * 1000;
const PASS_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour tells Finance and the spending approver which Cost Centers have no approved budget of the year after (`QĐ-111am`, B-4): see
 * `NextYearReminderService`; it writes only on 01/12 and on the Mondays after it. Each instance runs it; a notice carries its own event key
 * (the Cost Center and the day), so two instances, or a pass run again, write each notice once, and a failed pass only logs. The timer never
 * keeps the process alive. It stays in the API process, like the closure of the year (ADR-0018).
 */
@Injectable()
export class NextYearReminderSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NextYearReminderSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly reminders: NextYearReminderService) {}

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
      const done = await this.reminders.noticeDue();
      if (done.notices > 0) {
        this.logger.log(`Told ${done.notices} notice(s) of a Cost Center with no budget of the year after`);
      }
    } catch (error) {
      this.logger.error(
        `Next year budget reminder pass failed: ${describeForOperator(error)}`,
        traceForOperator(error),
      );
    } finally {
      this.schedule(PASS_EVERY_MS);
    }
  }
}
