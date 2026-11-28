import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../infrastructure/config/env-schema';
import { describeForOperator } from '../infrastructure/observability/operator-error';
import { QueueProducers } from '../infrastructure/queue/queue-producers';
import { jobOptionsFor, type QueueName } from '../infrastructure/queue/queue-registry';
import { RELAY_SOURCES, type RelaySource } from '../infrastructure/queue/relay-source.types';

const LIMIT = 100;
const WARNING_INTERVAL_MS = 60_000;

@Injectable()
export class OutboxRelayLoop implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayLoop.name);
  private readonly warnings = new Map<QueueName, number>();
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  private stopping = false;

  constructor(
    @Inject(RELAY_SOURCES) private readonly sources: RelaySource[],
    private readonly producers: QueueProducers,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onApplicationBootstrap(): void {
    const interval = this.config.get('QUEUE_RELAY_INTERVAL_MS', { infer: true });
    this.timer = setInterval(() => void this.tick(), interval);
  }

  tick(now = new Date()): Promise<void> {
    if (this.stopping) return Promise.resolve();
    this.pending ??= this.relayDue(now).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.pending;
  }

  private async relayDue(now: Date): Promise<void> {
    for (const source of this.sources) {
      let ids: string[] = [];
      try {
        ids = await source.dueIds(LIMIT, now);
        if (ids.length === 0) continue;
        await this.producers
          .get(source.queue)
          .addBulk(
            ids.map((id) => ({ name: 'deliver', data: { outboxId: id }, opts: jobOptionsFor(source.queue, id) })),
          );
      } catch (error) {
        this.reportDelay(source.queue, ids.length, now, error);
      }
    }
  }

  private reportDelay(queue: QueueName, count: number, now: Date, error: unknown): void {
    const previous = this.warnings.get(queue);
    if (previous !== undefined && now.getTime() - previous < WARNING_INTERVAL_MS) return;
    this.warnings.set(queue, now.getTime());
    const message = count ? `${count} outbox rows of ${queue} wait for the queue` : `Cannot read due rows for ${queue}`;
    this.logger.warn(`${message}: ${describeForOperator(error)}`);
  }
}
