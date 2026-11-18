import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { BudgetAttachmentExpiryService } from './budget-attachment-expiry.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

@Injectable()
export class BudgetAttachmentExpirySweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BudgetAttachmentExpirySweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly expiry: BudgetAttachmentExpiryService) {}

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
      const done = await this.expiry.expire(new Date());
      if (done.expired > 0) {
        this.logger.log(`Expired ${done.expired} unattached budget document upload(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Budget attachment expiry sweep failed: ${describeForOperator(error)}`,
        traceForOperator(error),
      );
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
