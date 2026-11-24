import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { DeviceReturnTaskSweepService } from './device-return-task-sweep.service';

const FIRST_SWEEP_AFTER_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Hourly background job reminding acting IT Admins and the Super Admin once per working day when open
 * offboarding device return tasks pass their due date.
 */
@Injectable()
export class DeviceReturnOverdueSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DeviceReturnOverdueSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly sweeps: DeviceReturnTaskSweepService) {}

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
      if (told > 0) this.logger.log(`Reminded about ${told} overdue device return task(s)`);
    } catch (error) {
      this.logger.error(`Device return overdue sweep failed: ${describeForOperator(error)}`, traceForOperator(error));
    } finally {
      this.schedule(SWEEP_EVERY_MS);
    }
  }
}
