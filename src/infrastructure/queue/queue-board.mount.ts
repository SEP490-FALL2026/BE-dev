import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { Queue } from 'bullmq';
import type { Application, RequestHandler } from 'express';
import type Redis from 'ioredis';
import type { EnvironmentVariables } from '../config/env-schema';
import { describeForOperator, isRetryable } from '../observability/operator-error';
import { createFailFastRedisClient, watchConnection } from '../redis/redis-client.factory';
import { redisSettingsFrom } from '../redis/redis.config';
import { credentialsMatch, QUEUE_BOARD_PATH, type QueueBoardCredentials } from './queue-board-auth';
import { QUEUE_NAMES } from './queue-registry';

function authorize(credentials: QueueBoardCredentials): RequestHandler {
  return (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    response.set('X-Robots-Tag', 'noindex');
    if (!credentialsMatch(request.get('authorization'), credentials)) {
      response.set('WWW-Authenticate', 'Basic realm="queues", charset="UTF-8"');
      response.status(401).end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.set('Allow', 'GET, HEAD');
      response.status(405).json({ error: 'ERRORS.QUEUE_READ_ONLY' });
      return;
    }
    next();
  };
}

@Injectable()
export class QueueBoardMount implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueBoardMount.name);
  private readonly queues: Queue[] = [];
  private client?: Redis;

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly host: HttpAdapterHost,
  ) {}

  onModuleInit(): void {
    if (!this.config.get('QUEUE_BOARD_ENABLED', { infer: true })) return;

    const settings = redisSettingsFrom(this.config);
    const client = createFailFastRedisClient(settings, 'queue-board', { commandTimeoutMs: 1_000 });
    this.client = client;
    watchConnection(client, this.logger, 'queue-board');

    const server = new ExpressAdapter().setBasePath(QUEUE_BOARD_PATH);
    for (const name of QUEUE_NAMES) {
      const queue = new Queue(name, {
        connection: client,
        prefix: `${settings.keyPrefix}:bull`,
        skipWaitingForReady: true,
        skipVersionCheck: true,
        skipMetasUpdate: true,
      });
      queue.on('error', (error) => {
        if (!isRetryable(error)) this.logger.debug(describeForOperator(error));
      });
      this.queues.push(queue);
    }
    createBullBoard({
      queues: this.queues.map((queue) => new BullMQAdapter(queue, { readOnlyMode: true })),
      serverAdapter: server,
    });
    const router = server.getRouter() as Application;
    router.disable('x-powered-by');
    const app = this.host.httpAdapter.getInstance<Application>();
    app.use(
      QUEUE_BOARD_PATH,
      authorize({
        username: this.config.get('QUEUE_BOARD_USERNAME', { infer: true }),
        password: this.config.get('QUEUE_BOARD_PASSWORD', { infer: true }),
      }),
      router,
    );
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await Promise.all(this.queues.map((queue) => queue.close()));
    } finally {
      this.client?.disconnect();
    }
  }
}
