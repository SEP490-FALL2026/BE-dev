import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { ExpiryRenewalWindowService } from './expiry-renewal-window.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour records the renewal windows that opened and tells the holder and the head (`BR-MF1-08a`). It changes and revokes nothing.
 * Each instance runs it (in the API process, ADR-0018); the key of the window makes that safe, and a failed pass only logs. The timer
 * never keeps the process alive.
 */
@Injectable()
export class ExpiryRenewalWindowSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ExpiryRenewalWindowSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly windows: ExpiryRenewalWindowService) {}

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
      const opened = await this.windows.openDue();
      if (opened > 0) this.logger.log(`Opened ${opened} renewal window(s)`);
    } catch (error) {
      this.logger.error(`Renewal window sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
