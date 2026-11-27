import type { LoggerService } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';
import { describeForOperator, isRetryable } from '../observability/operator-error';
import type { RedisSettings } from './redis.config';

interface FailFastRedisOptions {
  commandTimeoutMs?: number;
  keyPrefix?: string;
  /** The throttler starts its connection explicitly. BullMQ clients connect immediately. */
  lazyConnect?: boolean;
}

function connectionOptions(settings: RedisSettings, name: string): RedisOptions {
  return {
    host: settings.host,
    port: settings.port,
    username: settings.username || undefined,
    password: settings.password || undefined,
    tls: settings.tls ? {} : undefined,
    connectionName: name,
  };
}

export function createBlockingRedisClient(settings: RedisSettings, name: string): Redis {
  return new Redis({
    ...connectionOptions(settings, name),
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });
}

export function createFailFastRedisClient(
  settings: RedisSettings,
  name: string,
  options: FailFastRedisOptions = {},
): Redis {
  return new Redis({
    ...connectionOptions(settings, name),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    lazyConnect: options.lazyConnect ?? false,
    commandTimeout: options.commandTimeoutMs,
    keyPrefix: options.keyPrefix,
  });
}

const connectionFailures = new WeakMap<Redis, (error?: Error) => void>();

export function logRedisQueueError(logger: Pick<LoggerService, 'debug'>, error: Error): void {
  // BullMQ forwards connection errors that the client watcher has already reported.
  if (isRetryable(error) || /^(?:WRONGPASS|NOAUTH)\b/.test(error.message)) return;
  logger.debug?.(describeForOperator(error));
}

export function watchConnection(client: Redis, logger: LoggerService, name: string): void {
  if (connectionFailures.has(client)) return;
  let disconnected = false;

  const lost = (error?: Error): void => {
    if (disconnected) return;
    disconnected = true;
    logger.warn(`Redis connection ${name} lost: ${describeForOperator(error ?? new Error('Connection is closed.'))}`);
  };

  connectionFailures.set(client, lost);
  client.on('error', lost);
  client.on('close', lost);
  client.on('end', lost);
  client.on('ready', () => {
    if (!disconnected) return;
    disconnected = false;
    logger.log(`Redis connection ${name} restored`);
  });
}

export async function connectQuietly(client: Redis, logger: LoggerService, name: string): Promise<void> {
  watchConnection(client, logger, name);
  if (client.status !== 'wait') return;

  try {
    await client.connect();
  } catch (error) {
    connectionFailures.get(client)?.(error instanceof Error ? error : undefined);
  }
}
