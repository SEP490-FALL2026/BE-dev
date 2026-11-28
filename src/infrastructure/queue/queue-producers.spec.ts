import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env-schema';
import { QueueProducers } from './queue-producers';

describe('queue producers', () => {
  it('builds an immediately available fail-fast queue wrapper without a Redis key prefix', async () => {
    const config = new ConfigService<EnvironmentVariables, true>({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: 1,
      REDIS_KEY_PREFIX: 'fixture',
    });
    const producers = new QueueProducers(config);
    try {
      const queue = producers.get('email-delivery');
      expect(producers.get('email-delivery')).toBe(queue);
      expect(queue.opts).toMatchObject({
        prefix: 'fixture:bull',
        skipWaitingForReady: true,
        skipVersionCheck: true,
      });
      expect((await queue.getBackend().client).options).toMatchObject({
        keyPrefix: '',
        lazyConnect: false,
        enableOfflineQueue: false,
      });
    } finally {
      await producers.onModuleDestroy();
    }
  });
});
