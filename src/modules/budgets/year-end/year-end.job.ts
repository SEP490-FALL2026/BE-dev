import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { BudgetYearEndService } from './year-end.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour closes the budgets of the fiscal years that have ended (`QĐ-91c`): the version that was current stays as the
 * reference budget, the ones that never became current and the proposals never used are closed. Each instance runs it; the locks of the
 * Cost Center and year and the state of each row make that safe, running it again changes nothing, and a failed pass only logs. The
 * timer never keeps the process alive. It stays in the API process: there is no other worker for it.
 */
@Injectable()
export class BudgetYearEndSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BudgetYearEndSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly yearEnd: BudgetYearEndService) {}

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
      const done = await this.yearEnd.closeEndedYears();
      if (done.years > 0) {
        this.logger.log(
          `Closed ${done.years} budget year(s): ${done.expired} kept as reference, ${done.closedUnapproved} version(s) never current, ${done.proposalsClosed} proposal(s)`,
        );
      }
    } catch (error) {
      this.logger.error(`Budget year-end sweep failed: ${(error as Error).name}`);
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
