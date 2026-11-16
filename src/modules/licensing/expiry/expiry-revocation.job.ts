import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { ExpiryRevocationService } from './expiry-revocation.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour asks the revocation of the rights that ended the day before or earlier and are not renewed (`QĐ-111l`, `US-03-05` AC-2). It
 * takes nothing away: the task it opens is for the IT Admin. Each instance runs it (in the API process, ADR-0018); the gate that opens a
 * revocation adds no second task or reason, and a failed pass only logs. The timer never keeps the process alive.
 */
@Injectable()
export class ExpiryRevocationSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ExpiryRevocationSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly revocations: ExpiryRevocationService) {}

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
      const opened = await this.revocations.openDue();
      if (opened > 0) this.logger.log(`Opened ${opened} revocation(s) of rights that ended`);
    } catch (error) {
      this.logger.error(`Expiry revocation sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
