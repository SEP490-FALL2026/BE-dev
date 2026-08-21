import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { RequestContextService } from './infrastructure/observability/request-context.service';
import { StructuredJsonLogger } from './infrastructure/observability/structured-json.logger';

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(new StructuredJsonLogger(app.get(RequestContextService), 'software-license-worker'));
  app.enableShutdownHooks();

  // No queue is registered yet: BullMQ wiring is deliberately deferred until a job exists
  // that is genuinely slow or needs retries (ARCHITECTURE.md section 16). Nothing holds the
  // event loop open, so this process starts and exits. Say so — a silent immediate exit
  // reads as a defect, and someone will spend an afternoon looking for one.
  new Logger('Worker').warn('Worker started with no registered queue processors; exiting until one exists.');
}

void bootstrapWorker().catch((error: unknown) => {
  console.error('Worker bootstrap failed', error);
  process.exitCode = 1;
});
