import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { StopRequestSweepService } from './stop-request-sweep.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour tells, one time for each request, that an open request to stop collection passed its deadline (`US-09-04` AC-5). It
 * completes and closes nothing. Each instance runs it; the mark makes that safe, and a failed pass only logs. The timer never keeps the
 * process alive.
 */
@Injectable()
export class StopRequestSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(StopRequestSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly sweeps: StopRequestSweepService) {}

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
      const { told } = await this.sweeps.run();
      if (told > 0) this.logger.log(`Reminded about ${told} request(s) to stop collection past their deadline`);
    } catch (error) {
      this.logger.error(`Stop request sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
