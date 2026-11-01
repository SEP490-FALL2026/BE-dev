import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { parseCorsOrigins } from '../infrastructure/config/cors';
import { EnvironmentVariables } from '../infrastructure/config/env-schema';
import { toOpenApi30Presentation } from '../infrastructure/http/openapi-presentation';
import { withGlobalRateLimitResponse } from '../infrastructure/http/openapi-rate-limit';
import { withRequestParserResponses } from '../infrastructure/http/openapi-request-parser';
import { withSuccessMessageExamples } from '../infrastructure/http/openapi-success-examples';
import { applyRequestBodyLimit } from '../infrastructure/http/request-body-limit';

interface ConfigurableHttpInstance {
  set: (setting: string, value: unknown) => void;
}

export function requireExpressInstance(instance: unknown): ConfigurableHttpInstance {
  const isObjectOrFunction = instance !== null && (typeof instance === 'object' || typeof instance === 'function');

  if (!isObjectOrFunction || typeof (instance as ConfigurableHttpInstance).set !== 'function') {
    throw new Error('Expected an Express HTTP adapter to configure trust proxy');
  }

  return instance as ConfigurableHttpInstance;
}

export interface ConfigureApplicationOptions {
  /** Mount the interactive docs route. Disable when a caller only needs the document object. */
  mountDocs?: boolean;
  /** Optional startup measurements; export/test callers need no reporter. */
  onStartupPhase?: (phase: 'http-configured' | 'swagger-generated') => void;
}

export function configureApplication(app: INestApplication, options: ConfigureApplicationOptions = {}): void {
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const apiPrefix = config.get('API_PREFIX', { infer: true });
  const allowedOrigins = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));

  app.use(helmet());
  // Bearer tokens only: nothing in this API reads or sets a cookie, so cross-origin calls carry no credentials.
  app.enableCors({ origin: allowedOrigins });
  applyRequestBodyLimit(app);
  requireExpressInstance(app.getHttpAdapter().getInstance()).set(
    'trust proxy',
    config.get('TRUST_PROXY_HOPS', { infer: true }),
  );
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI });
  app.enableShutdownHooks();
  options.onStartupPhase?.('http-configured');

  if ((options.mountDocs ?? true) && config.get('SWAGGER_ENABLED', { infer: true })) {
    const document = createOpenApiDocument(app);
    options.onStartupPhase?.('swagger-generated');
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Software License Management API')
    .setDescription(
      'Internal software license and technology cost API. A text field whose description says it is trimmed has its leading and ' +
        'trailing whitespace removed before it is checked; for the other text fields the description makes no such promise.',
    )
    .setVersion('1.0')
    .setOpenAPIVersion('3.0.0')
    .addBearerAuth()
    .build();

  return withRequestParserResponses(
    withGlobalRateLimitResponse(
      toOpenApi30Presentation(
        cleanupOpenApiDoc(withSuccessMessageExamples(SwaggerModule.createDocument(app, swaggerConfig)), {
          version: '3.0',
        }),
      ),
    ),
  );
}
