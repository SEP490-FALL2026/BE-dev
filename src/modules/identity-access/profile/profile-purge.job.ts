import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { ProfilePurgeService } from './profile-purge.service';

/** The first pass waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_PASS_AFTER_MS = 2 * 60 * 1000;
const PASS_EVERY_MS = 5 * 60 * 1000;

/**
 * Deletes, every few minutes, the pictures an account stopped pointing at (`QĐ-111av`, `MAJ-12`). It runs in the API graph only, where the
 * storage is mounted; each instance runs it and the row locks keep two from taking the same one; a failed pass only logs and the rows wait.
 * The timer never keeps the process alive.
 */
@Injectable()
export class ProfilePurgeSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ProfilePurgeSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly purges: ProfilePurgeService) {}

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
      const deleted = await this.purges.purgeDue();
      if (deleted > 0) this.logger.log(`Deleted ${deleted} picture object(s) nobody points to`);
    } catch (error) {
      this.logger.error(`Picture purge failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(PASS_EVERY_MS);
    }
  }
}
