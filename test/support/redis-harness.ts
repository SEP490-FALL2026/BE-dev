import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { connect, createServer, Socket } from 'node:net';
import type { RedisSettings } from '../../src/infrastructure/redis/redis.config';

export function redisTestUrl(): string {
  const url = process.env.TEST_REDIS_URL;
  if (url) return url;
  if (process.env.CI === 'true') throw new Error('TEST_REDIS_URL is required on CI');
  return 'redis://127.0.0.1:56379';
}

export function redisTestSettings(prefix: string): RedisSettings {
  const url = new URL(redisTestUrl());
  return {
    host: url.hostname,
    port: Number(url.port || '6379'),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    tls: url.protocol === 'rediss:',
    keyPrefix: prefix,
  };
}

export function unreachableRedisSettings(prefix: string): RedisSettings {
  return { ...redisTestSettings(prefix), host: '127.0.0.1', port: 1 };
}

export async function keysUnder(admin: Redis, prefix: string): Promise<string[]> {
  const keys = new Set<string>();
  let cursor = '0';
  do {
    const [next, batch] = await admin.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 100);
    cursor = next;
    for (const key of batch) keys.add(key);
  } while (cursor !== '0');
  return [...keys].sort();
}

export async function withRedisPrefix(): Promise<{ prefix: string; admin: Redis; cleanup(): Promise<void> }> {
  const prefix = `slm-test-${randomUUID()}`;
  const admin = new Redis(redisTestUrl(), { lazyConnect: true, retryStrategy: () => null, commandTimeout: 1_000 });
  try {
    await admin.connect();
  } catch (error) {
    admin.disconnect();
    throw error;
  }

  let closed = false;
  return {
    prefix,
    admin,
    async cleanup() {
      if (closed) return;
      closed = true;
      try {
        const keys = await keysUnder(admin, prefix);
        for (let start = 0; start < keys.length; start += 100) {
          await admin.del(...keys.slice(start, start + 100));
        }
      } finally {
        admin.disconnect();
      }
    },
  };
}

export async function pauseServer(admin: Redis, ms: number): Promise<void> {
  await admin.call('CLIENT', 'PAUSE', ms);
}

export async function killClient(admin: Redis, client: Redis): Promise<void> {
  const id = await client.call('CLIENT', 'ID');
  if (typeof id !== 'number' || !Number.isSafeInteger(id)) throw new Error('Redis returned an invalid client ID');
  await admin.call('CLIENT', 'KILL', 'ID', id);
}

export async function toggleableRedisProxy(): Promise<{
  port: number;
  stop(): Promise<void>;
  start(): Promise<void>;
  close(): Promise<void>;
}> {
  const upstream = redisTestSettings('');
  const sockets = new Set<Socket>();
  const server = createServer((client) => {
    const target = connect({ host: upstream.host, port: upstream.port });
    for (const [source, peer] of [
      [client, target],
      [target, client],
    ] as const) {
      sockets.add(source);
      source.on('error', () => source.destroy());
      source.once('close', () => {
        sockets.delete(source);
        peer.destroy();
      });
      source.pipe(peer);
    }
  });

  async function listen(port: number): Promise<void> {
    const listening = once(server, 'listening');
    server.listen(port, '127.0.0.1');
    await listening;
  }

  async function stop(): Promise<void> {
    if (!server.listening) return;
    const closed = new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    for (const socket of sockets) socket.destroy();
    await closed;
  }

  await listen(0);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await stop();
    throw new Error('Redis test proxy did not bind a TCP port');
  }
  return {
    port: address.port,
    stop,
    async start() {
      if (!server.listening) await listen(address.port);
    },
    close: stop,
  };
}
