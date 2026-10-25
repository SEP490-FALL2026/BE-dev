import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { SaasIssueSweepService } from './saas-issue-sweep.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour closes the resolved reports whose window to reopen has passed and tells, one time for each new report, that its day
 * to be taken up has passed (`US-07-11` AC-6). It reassigns nothing and never closes a report that nobody has taken up. Each instance
 * runs it; the mark and the lock make that safe, and a failed pass only logs. The timer never keeps the process alive.
 */
@Injectable()
export class SaasIssueSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SaasIssueSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly sweeps: SaasIssueSweepService) {}

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
      const { closed, told } = await this.sweeps.run();
      if (closed > 0 || told > 0) this.logger.log(`Closed ${closed} resolved SaaS issue(s), reminded about ${told}`);
    } catch (error) {
      this.logger.error(`SaaS issue sweep failed: ${(error as Error).name}`);
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
