import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { ItCoverageSweepService } from './it-coverage-sweep.service';

/** The first pass waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_PASS_AFTER_MS = 5 * 60 * 1000;
const PASS_EVERY_MS = 60 * 60 * 1000;

/**
 * Hourly weekday sweep alerting the Super Admin when an active non-starting department has no acting IT Admin
 * (neither usable in-charge nor usable appointed substitute). The timer never keeps the process alive.
 */
@Injectable()
export class ItCoverageSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ItCoverageSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly sweeps: ItCoverageSweepService) {}

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule(FIRST_PASS_AFTER_MS);
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
      if (told > 0) this.logger.log(`Alerted Super Admin about ${told} department(s) missing IT coverage`);
    } catch (error) {
      this.logger.error(`IT coverage sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(PASS_EVERY_MS);
    }
  }
}
