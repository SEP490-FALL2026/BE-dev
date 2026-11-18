import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { YearStartCommitmentsService } from './year-start-commitments.service';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour makes the commitments of 01/01 (`FR-5.8`(6), `BR-MF1-09e`, `QĐ-109a`): the first pass after the organization's midnight of the new
 * year makes the commitment of each paid request whose right goes on or that was approved and not yet granted, and marks the year done, so the
 * hours after it find nothing to do. Each instance runs it; the mark of the year, the unique key of a commitment and the order of the locks make
 * that safe, running it again changes nothing, a failed pass only logs and is tried again at the next hour, and the timer never keeps the process
 * alive. It stays in the API process (ADR-0018): the worker has no listener of the budgets.
 */
@Injectable()
export class YearStartCommitmentsSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(YearStartCommitmentsSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly commitments: YearStartCommitmentsService) {}

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
      const done = await this.commitments.run(new Date());
      if (done.status === 'COMPLETED') {
        this.logger.log(
          `Made ${done.created} commitment(s) for ${done.year} on 01/01 (${done.skipped} request(s) left out, see the Audit Trail)`,
        );
      }
    } catch (error) {
      this.logger.error(`Year-start commitments sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
