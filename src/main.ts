import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { configureApplication } from './app/configure-application';
import { EnvironmentVariables } from './infrastructure/config/env-schema';
import { RequestContextService } from './infrastructure/observability/request-context.service';
import { StructuredJsonLogger } from './infrastructure/observability/structured-json.logger';
import { createStartupReporter } from './infrastructure/observability/startup-timing';

async function bootstrap() {
  const startup = createStartupReporter('software-license-api');
  startup('imports-loaded');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  startup('nest-created');
  app.useLogger(new StructuredJsonLogger(app.get(RequestContextService)));
  configureApplication(app, { onStartupPhase: startup });
  startup('http-ready');
  await app.init();
  startup('initialized');
  await app.listen(app.get(ConfigService<EnvironmentVariables, true>).get('PORT', { infer: true }));
  startup('listening');
}

void bootstrap().catch((error: unknown) => {
  console.error('Application bootstrap failed', error);
  process.exitCode = 1;
});
