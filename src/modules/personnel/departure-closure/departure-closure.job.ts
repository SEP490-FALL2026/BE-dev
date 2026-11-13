import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { DepartureClosureService } from './departure-closure.service';
import { MailboxLockSettlement } from './mailbox-lock-settlement.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour writes the lock of the mailbox (1b) that the listener of the last K1 revocation could not write (`MailboxLockSettlement`, D-72),
 * then closes each departure that has left, has (1b) written and has nothing left to wait for (`DepartureClosureService.sweep`, `QĐ-110e`):
 * what the moment-of-fact calls (the last revocation completed, (1b) written on the route) did not reach, such as a person marked as left after
 * the rest was done. Each case has a transaction of its own and is closed once, so the hourly pass and every instance that runs it are safe; a
 * work that fails as a whole only logs, the other still runs in the same pass, and the next pass tries again. The timer never keeps the process
 * alive.
 */
@Injectable()
export class DepartureClosureSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DepartureClosureSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly settlement: MailboxLockSettlement,
    private readonly closing: DepartureClosureService,
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
      // First the lock of the mailbox the listener could not write, then the closing, which may need it; a work that fails as a whole never
      // takes the other with it for the hour.
      await this.run('Mailbox lock settlement', async () => {
        const pass = await this.settlement.settle();
        if (pass.written > 0) this.logger.log(`Wrote the lock of the mailbox of ${pass.written} departure(s)`);
      });
      await this.run('Departure closing', async () => {
        const pass = await this.closing.sweep();
        if (pass.closed > 0) this.logger.log(`Closed ${pass.closed} departure(s)`);
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
