import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { RequestContextService } from './infrastructure/observability/request-context.service';
import { StructuredJsonLogger } from './infrastructure/observability/structured-json.logger';

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(new StructuredJsonLogger(app.get(RequestContextService), 'software-license-worker'));
  app.enableShutdownHooks();

  // The mail loop (EmailDispatchLoop) is the only work for now. It polls PostgreSQL, so no queue
  // is registered and Redis is not needed; the open timer keeps the process alive until a
  // shutdown signal closes the application (ADR-0012).
  new Logger('Worker').log('Worker started: delivering the email outbox.');
}

void bootstrapWorker().catch((error: unknown) => {
  console.error('Worker bootstrap failed', error);
  process.exitCode = 1;
});
