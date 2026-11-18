import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ExpiryReminderService } from './expiry-reminder.service';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour reminds the holder, the head and the IT Admin that a right which ends on a day ends within seven days (`US-03-05`
 * AC-1). It changes and revokes nothing. Each instance runs it; the unique reminder makes that safe, and a failed pass only logs.
 * The timer never keeps the process alive.
 */
@Injectable()
export class ExpiryReminderSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ExpiryReminderSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly reminders: ExpiryReminderService) {}

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
      const told = await this.reminders.noticeDue();
      if (told > 0) this.logger.log(`Wrote ${told} reminder(s) that a right is about to end`);
    } catch (error) {
      this.logger.error(`Expiry reminder sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
