import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { SubscriptionRenewalSweepService } from './subscription-renewal-sweep.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour looks at the milestones of the subscription periods (`US-11-01`, `US-11-03`, `US-11-04`): the alerts due, the late
 * flag and the event of a milestone passed with no decision. It renews, cancels and decides nothing. Each instance runs it; every
 * step is written once, so that is safe, and a failed pass only logs. The timer never keeps the process alive.
 */
@Injectable()
export class SubscriptionRenewalSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionRenewalSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly sweeps: SubscriptionRenewalSweepService) {}

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
      const result = await this.sweeps.sweep();
      const written = result.told + result.flaggedLate + result.deadlineEvents;
      if (written > 0) {
        this.logger.log(
          `Renewal pass: ${result.told} alert(s), ${result.flaggedLate} late flag(s), ${result.deadlineEvents} milestone event(s)`,
        );
      }
    } catch (error) {
      this.logger.error(`Subscription renewal sweep failed: ${(error as Error).name}`);
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
