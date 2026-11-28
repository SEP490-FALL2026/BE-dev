import type { QueueName } from './queue-registry';

export const RELAY_SOURCES = Symbol('RELAY_SOURCES');

export interface RelaySource {
  readonly queue: QueueName;
  dueIds(limit: number, now: Date): Promise<string[]>;
}
