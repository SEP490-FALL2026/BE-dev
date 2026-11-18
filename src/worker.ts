import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';
import { RequestContextService } from './infrastructure/observability/request-context.service';
import { StructuredJsonLogger } from './infrastructure/observability/structured-json.logger';
import { createStartupReporter } from './infrastructure/observability/startup-timing';

async function bootstrapWorker(): Promise<void> {
  const startup = createStartupReporter('software-license-worker');
  startup('imports-loaded');
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(new StructuredJsonLogger(app.get(RequestContextService), 'software-license-worker'));
  app.enableShutdownHooks();
  startup('worker-ready');

  // The mail loop (EmailDispatchLoop) and the loop over the open steps of requests (RequestWorkLoop) are the
  // work for now. Both poll PostgreSQL, so no queue is registered and Redis is not needed; the open timers
  // keep the process alive until a shutdown signal closes the application (ADR-0012).
  new Logger('Worker').log('Worker started: delivering the email outbox and reassigning the steps of requests.');
}

void bootstrapWorker().catch((error: unknown) => {
  console.error('Worker bootstrap failed', error);
  process.exitCode = 1;
});
