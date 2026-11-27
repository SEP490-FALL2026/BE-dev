import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { EnvironmentVariables } from '../config/env-schema';
import * as redisFactory from '../redis/redis-client.factory';
import { QueueBoardMount } from './queue-board.mount';

describe('queue board mount', () => {
  it('does not touch the adapter or create a Redis connection when disabled', async () => {
    const config = new ConfigService<EnvironmentVariables, true>({ QUEUE_BOARD_ENABLED: false });
    const client = jest.spyOn(redisFactory, 'createFailFastRedisClient');
    const host = new HttpAdapterHost();
    const mount = new QueueBoardMount(config, host);
    try {
      mount.onModuleInit();
      await mount.onModuleDestroy();
      expect(client).not.toHaveBeenCalled();
    } finally {
      client.mockRestore();
    }
  });
});
