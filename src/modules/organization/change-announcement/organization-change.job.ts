import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { OrganizationContextService } from '../organization-context.service';
import { OrganizationChangeService } from './organization-change.service';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Tells the listeners of the organization of the changes that took effect on a day that has come (`US-03-01` AC-7): once an
 * hour the API asks for the placements and head periods dated for today or before that were not told. It runs in the API
 * graph, where every module that listens is registered. Each instance runs it; the unique announcement row makes that safe,
 * and a failed pass only logs. The timer never keeps the process alive.
 */
@Injectable()
export class OrganizationChangeSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OrganizationChangeSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly changes: OrganizationChangeService,
    private readonly context: OrganizationContextService,
  ) {}

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
      const { told, failed } = await this.changes.announceDue(await this.context.businessToday());
      if (told > 0 || failed > 0) this.logger.log(`Told ${told} change(s) of the organization, ${failed} failed`);
    } catch (error) {
      this.logger.error(`Organization change sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
