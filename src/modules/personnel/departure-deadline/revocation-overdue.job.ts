import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { RevocationOverdueService } from './revocation-overdue.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour tells the IT Admin in charge and the Super Admin that the rights of a person who is leaving are still not taken away past the
 * deadline of the case; the notice is written once for a case and a working day, so the hourly pass and every instance that runs it are
 * safe, and a failed pass only logs. It changes and revokes nothing. The timer never keeps the process alive.
 */
@Injectable()
export class RevocationOverdueSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RevocationOverdueSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly overdue: RevocationOverdueService) {}

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
      if (told > 0) this.logger.log(`Told ${told} departure(s) whose rights are past the deadline of revocation`);
    } catch (error) {
      this.logger.error(`Revocation overdue sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
