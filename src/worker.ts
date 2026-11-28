import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';
import { validateEnvironment } from './infrastructure/config/env-schema';
import { RequestContextService } from './infrastructure/observability/request-context.service';
import { StructuredJsonLogger } from './infrastructure/observability/structured-json.logger';
import { createStartupReporter } from './infrastructure/observability/startup-timing';

async function bootstrapWorker(): Promise<void> {
  const startup = createStartupReporter('software-license-worker');
  startup('imports-loaded');
  const { BACKGROUND_JOBS_TRANSPORT } = validateEnvironment(process.env);
  const app = await NestFactory.createApplicationContext(WorkerModule.forTransport(BACKGROUND_JOBS_TRANSPORT), {
    bufferLogs: true,
  });
  app.useLogger(new StructuredJsonLogger(app.get(RequestContextService), 'software-license-worker'));
  app.enableShutdownHooks();
  startup('worker-ready');

  // Requests keep polling PostgreSQL. The selected transport processes the email outbox.
  new Logger('Worker').log('Worker started: delivering the email outbox and reassigning the steps of requests.');
}

void bootstrapWorker().catch((error: unknown) => {
  console.error('Worker bootstrap failed', error);
  process.exitCode = 1;
});
