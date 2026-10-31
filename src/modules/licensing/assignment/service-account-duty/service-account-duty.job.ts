import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ServiceAccountDutyService } from './service-account-duty.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour writes, one time for each service account and day, the reminder that the day of the transfer or the departure of
 * its person passed without a new person (`US-03-08` AC-5). It changes and revokes nothing. Each instance runs it; the unique reminder
 * makes that safe, and a failed pass only logs. The timer never keeps the process alive.
 */
@Injectable()
export class ServiceAccountDutySweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ServiceAccountDutySweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly duties: ServiceAccountDutyService) {}

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
      const told = await this.duties.noticeOverdue();
      if (told > 0) this.logger.log(`Reminded about ${told} service account(s) still without a new person`);
    } catch (error) {
      this.logger.error(`Service account duty sweep failed: ${(error as Error).name}`);
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
