import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { DecisionFollowUpService } from './decision-follow-up.service';

/** The first pass waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_PASS_AFTER_MS = 6 * 60 * 1000;
const PASS_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour walks the queue of the heads (`FR-4.12`): pauses and resumes the recommendations of people in a transfer, routes the new
 * ones, makes a queue wait or go back when its department loses or gains a head, and (later steps) tells what is overdue or ending. It
 * changes no seat; a failed pass only logs and the timer never keeps the process alive.
 */
@Injectable()
export class DecisionFollowUpSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DecisionFollowUpSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly followUp: DecisionFollowUpService) {}

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
      this.running = this.pass();
    }, delayMs);
    this.timer.unref();
  }

  private async pass(): Promise<void> {
    try {
      const tally = await this.followUp.run();
      if (tally) this.logger.log(`Queue of the heads: ${JSON.stringify(tally)}`);
    } catch (error) {
      this.logger.error(`Follow-up of the queue failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(PASS_EVERY_MS);
    }
  }
}
