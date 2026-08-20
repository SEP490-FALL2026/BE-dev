import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { parseCorsOrigins } from './infrastructure/config/cors';
import { EnvironmentVariables } from './infrastructure/config/env-schema';

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const apiPrefix = config.get('API_PREFIX', { infer: true });
  const allowedOrigins = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));

  app.use(helmet());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  const httpServer = app.getHttpAdapter().getInstance() as {
    set?: (setting: string, value: number) => void;
  };
  httpServer.set?.('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI });
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const document = createOpenApiDocument(app);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Software License Management API')
    .setDescription('Internal software license and technology cost API')
    .setVersion('1.0')
    .setOpenAPIVersion('3.0.0')
    .addBearerAuth()
    .build();

  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, swaggerConfig), {
    version: '3.0',
  });
}
