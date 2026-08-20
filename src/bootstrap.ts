import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { parseCorsOrigins } from './infrastructure/config/cors';
import { EnvironmentVariables } from './infrastructure/config/env-schema';

interface ConfigurableHttpInstance {
  set: (setting: string, value: unknown) => void;
}

export function requireExpressInstance(instance: unknown): ConfigurableHttpInstance {
  const isObjectOrFunction =
    instance !== null && (typeof instance === 'object' || typeof instance === 'function');

  if (!isObjectOrFunction || typeof (instance as ConfigurableHttpInstance).set !== 'function') {
    throw new Error('Expected an Express HTTP adapter to configure trust proxy');
  }

  return instance as ConfigurableHttpInstance;
}

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const apiPrefix = config.get('API_PREFIX', { infer: true });
  const allowedOrigins = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));

  app.use(helmet());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  requireExpressInstance(app.getHttpAdapter().getInstance()).set(
    'trust proxy',
    config.get('TRUST_PROXY_HOPS', { infer: true }),
  );
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
