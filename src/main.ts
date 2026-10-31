import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { configureApplication } from './app/configure-application';
import { EnvironmentVariables } from './infrastructure/config/env-schema';
import { RequestContextService } from './infrastructure/observability/request-context.service';
import { StructuredJsonLogger } from './infrastructure/observability/structured-json.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new StructuredJsonLogger(app.get(RequestContextService)));
  configureApplication(app);
  await app.listen(app.get(ConfigService<EnvironmentVariables, true>).get('PORT', { infer: true }));
}

void bootstrap().catch((error: unknown) => {
  console.error('Application bootstrap failed', error);
  process.exitCode = 1;
});
