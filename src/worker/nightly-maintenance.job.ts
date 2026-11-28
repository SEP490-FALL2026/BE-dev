import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Worker } from 'bullmq';
import { describeForOperator } from '../infrastructure/observability/operator-error';
import { QueueProducers } from '../infrastructure/queue/queue-producers';
import { jobOptionsFor } from '../infrastructure/queue/queue-registry';
import { QueueWorkerFactory } from '../infrastructure/queue/queue-worker-factory';
import { NightlyMaintenanceRunner } from './nightly-maintenance.runner';

const MAINTENANCE_QUEUE = 'nightly-maintenance';
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const vietnamClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
});

function vietnamWallClockAsUtc(date: Date): number {
  const parts = new Map(vietnamClock.formatToParts(date).map(({ type, value }) => [type, Number(value)]));
  return Date.UTC(
    parts.get('year')!,
    parts.get('month')! - 1,
    parts.get('day'),
    parts.get('hour'),
    parts.get('minute'),
    parts.get('second'),
  );
}

export function nextMidnightInVietnam(now: Date): Date {
  const local = new Date(vietnamWallClockAsUtc(now));
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  const offset = vietnamWallClockAsUtc(new Date(midnight)) - midnight;
  return new Date(midnight - offset);
}

export const BOOT_RUN_DELAY_MS = 60_000;
export const BOOT_RUN_DEDUP = { id: 'nightly-maintenance-boot', ttl: 600_000 } as const;
export const NIGHTLY_MAINTENANCE_TIMING = Symbol('NIGHTLY_MAINTENANCE_TIMING');
export interface MaintenanceTiming {
  bootDelayMs: number;
  retryDelayMs: number;
}

@Injectable()
export class NightlyMaintenanceScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NightlyMaintenanceScheduler.name);
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    private readonly producers: QueueProducers,
    private readonly workers: QueueWorkerFactory,
    private readonly runner: NightlyMaintenanceRunner,
    @Optional()
    @Inject(NIGHTLY_MAINTENANCE_TIMING)
    private readonly timing: MaintenanceTiming = { bootDelayMs: BOOT_RUN_DELAY_MS, retryDelayMs: 30_000 },
  ) {}

  onApplicationBootstrap(): void {
    void this.register();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.worker) await this.workers.close(this.worker);
  }

  private async register(retrying = false): Promise<void> {
    try {
      await this.producers
        .get(MAINTENANCE_QUEUE)
        .upsertJobScheduler(
          MAINTENANCE_QUEUE,
          { pattern: '0 0 * * *', tz: TIME_ZONE },
          { name: 'run', data: {}, opts: jobOptionsFor(MAINTENANCE_QUEUE) },
        );
      if (this.stopped) return;
      this.worker = this.workers.create(MAINTENANCE_QUEUE, () => this.process(), 1);
      void this.workers.run(this.worker).catch((error: unknown) => {
        if (this.stopped) return;
        this.logger.error(`Nightly maintenance worker stopped: ${describeForOperator(error)}`);
      });
      this.logger.log('Nightly maintenance scheduler registered');
      this.timer = setTimeout(() => void this.enqueueBoot(), this.timing.bootDelayMs);
    } catch (error) {
      this.retry(() => this.register(true), retrying, 'registration', error);
    }
  }

  private async enqueueBoot(retrying = false): Promise<void> {
    try {
      await this.producers.get(MAINTENANCE_QUEUE).add(
        'run',
        {},
        {
          ...jobOptionsFor(MAINTENANCE_QUEUE),
          deduplication: BOOT_RUN_DEDUP,
        },
      );
      if (retrying && !this.stopped) this.logger.log('Nightly maintenance boot run enqueued');
    } catch (error) {
      this.retry(() => this.enqueueBoot(true), retrying, 'boot enqueue', error);
    }
  }

  private retry(action: () => Promise<void>, retrying: boolean, phase: string, error: unknown): void {
    if (this.stopped) return;
    if (!retrying) this.logger.warn(`Nightly maintenance ${phase} will retry: ${describeForOperator(error)}`);
    this.timer = setTimeout(() => void action(), this.timing.retryDelayMs);
  }

  private async process() {
    try {
      return await this.runner.run(new Date());
    } catch (error) {
      this.logger.error(`Nightly maintenance failed: ${describeForOperator(error)}`);
      throw new Error('MAINTENANCE_FAILED');
    }
  }
}
