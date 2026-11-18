import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DocumentService } from './document.service';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';

/** The first sweep waits, so a short-lived process (a test, a command) never starts one. */
const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Gives up the files whose upload never came (`DB-13`): once an hour the API asks the document service to expire what was
 * declared a day ago and never uploaded. Each instance runs it; the row lock and the state check make that safe, and a
 * failed sweep only logs. The timer never keeps the process alive.
 */
@Injectable()
export class DocumentExpirySweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DocumentExpirySweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly documents: DocumentService) {}

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
      const expired = await this.documents.expireAbandoned();
      if (expired > 0) this.logger.log(`Gave up ${expired} document(s) whose upload never came`);
    } catch (error) {
      this.logger.error(`Document expiry sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
