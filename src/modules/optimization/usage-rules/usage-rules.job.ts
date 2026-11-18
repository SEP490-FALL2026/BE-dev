import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { UsageRulesService } from './usage-rules.service';

/** The first pass waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_PASS_AFTER_MS = 5 * 60 * 1000;
const PASS_EVERY_MS = 60 * 60 * 1000;

/**
 * Once an hour asks for the run of `G3` and `G4` for the period the schedule parameter names; the claim of the period makes it run once
 * however many instances ask, and a period already run is left alone. It changes no seat. A failed pass only logs; the timer never keeps
 * the process alive.
 */
@Injectable()
export class UsageRulesSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(UsageRulesSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly rules: UsageRulesService) {}

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
      const run = await this.rules.run();
      if (run) {
        this.logger.log(
          `Run ${run.ruleSet} ${run.periodKey}: ${run.status}, ${run.createdCount} made, ${run.updatedCount} changed, ${run.closedCount} closed, ${run.failedCount} failed`,
        );
      }
    } catch (error) {
      this.logger.error(`G3/G4 pass failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(PASS_EVERY_MS);
    }
  }
}
