import { LoggerService } from '@nestjs/common';
import Redis from 'ioredis';
import * as factory from './redis-client.factory';
import { RedisSettings } from './redis.config';

const settings: RedisSettings = {
  host: '127.0.0.1',
  port: 1,
  username: 'test-redis-user',
  password: 'test-redis-password',
  tls: true,
  keyPrefix: 'test',
};

function loggerForTest() {
  return { warn: jest.fn(), log: jest.fn(), error: jest.fn() } satisfies LoggerService;
}

describe('Redis client connections', () => {
  it('leaves connection errors to the transition logger and reports unexpected queue errors safely', () => {
    const logger = { debug: jest.fn() };
    factory.logRedisQueueError(logger, new Error('WRONGPASS invalid credentials'));
    factory.logRedisQueueError(logger, new Error('NOAUTH Authentication required.'));
    factory.logRedisQueueError(logger, Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' }));
    expect(logger.debug).not.toHaveBeenCalled();

    factory.logRedisQueueError(logger, new Error('Unexpected error with a private Redis value'));
    expect(logger.debug).toHaveBeenCalledWith('Error retryable=false');
  });

  it('creates the blocking BullMQ worker client without lazy connect or a key prefix', () => {
    const client = factory.createBlockingRedisClient(settings, 'worker');
    try {
      expect(client.options).toMatchObject({
        host: settings.host,
        port: settings.port,
        username: settings.username,
        password: settings.password,
        tls: {},
        lazyConnect: false,
        maxRetriesPerRequest: null,
        keyPrefix: '',
      });
    } finally {
      client.disconnect();
    }
  });

  it('creates a fail-fast BullMQ producer that starts connecting immediately', () => {
    const client = factory.createFailFastRedisClient(settings, 'producer');
    try {
      expect(client.options).toMatchObject({
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        lazyConnect: false,
        keyPrefix: '',
      });
    } finally {
      client.disconnect();
    }
  });

  it('sets lazy connect, prefix and command timeout for the throttler', () => {
    const client = factory.createFailFastRedisClient(settings, 'throttler', {
      lazyConnect: true,
      commandTimeoutMs: 150,
      keyPrefix: 'test:rl:',
    });
    try {
      expect(client.options).toMatchObject({
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        commandTimeout: 150,
        keyPrefix: 'test:rl:',
      });
    } finally {
      client.disconnect();
    }
  });

  it('logs once per lost and restored connection and omits the raw error', () => {
    const client = new Redis({ lazyConnect: true });
    const logger = loggerForTest();
    factory.watchConnection(client, logger, 'relay');
    const error = Object.assign(new Error('connect host:6379 with password'), { code: 'ECONNREFUSED' });

    for (let reconnects = 0; reconnects < 3; reconnects++) {
      client.emit('error', error);
      client.emit('end');
      client.emit('error', error);
      client.emit('ready');
      client.emit('ready');
    }

    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(logger.log).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('retryable=true'));
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining(error.message));
    client.disconnect();
  });

  it('continues after a failed connection and reports it once', async () => {
    const client = new Redis({ lazyConnect: true });
    const logger = loggerForTest();
    const error = Object.assign(new Error('could not connect to host'), { code: 'ECONNREFUSED' });
    const connect = jest.spyOn(client, 'connect').mockRejectedValueOnce(error);

    await expect(factory.connectQuietly(client, logger, 'throttler')).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('retryable=true'));
    client.disconnect();
  });
});
