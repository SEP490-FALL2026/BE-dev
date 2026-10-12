import { INestApplication } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApplication, createOpenApiDocument } from '../../src/bootstrap';
import {
  IS_AUTHENTICATED_ONLY_METADATA,
  REQUIRED_ROLES_METADATA,
} from '../../src/infrastructure/security/decorators/access.decorators';
import { IS_PUBLIC_METADATA } from '../../src/infrastructure/security/decorators/public.decorator';
import { API_COVERAGE_MANIFEST } from '../support/api-coverage-manifest';

/** The only routes anyone may call without signing in. Adding to this list is a security decision. */
const PUBLIC_ALLOWLIST = [
  'AuthController.login',
  'AuthController.logout',
  'AuthController.refresh',
  'HealthController.getLiveness',
  'HealthController.getReadiness',
];

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

describe('API inventory (e2e)', () => {
  let app: INestApplication<App>;
  let operations: { key: string; operationId: string | undefined }[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, { mountDocs: false });
    await app.init();

    const document = createOpenApiDocument(app);
    operations = Object.entries(document.paths).flatMap(([path, item]) =>
      HTTP_METHODS.flatMap((method) => {
        const operation = item[method];
        return operation ? [{ key: `${method.toUpperCase()} ${path}`, operationId: operation.operationId }] : [];
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('the operations exported in OpenAPI are exactly the operations in the coverage manifest', () => {
    const exported = operations.map((operation) => operation.key).sort();
    const manifest = [...API_COVERAGE_MANIFEST].sort();

    // Set equality, never a count: an operation added without a manifest entry, or a manifest
    // entry whose operation was removed, must each fail here.
    expect(exported).toEqual(manifest);
  });

  it('every exported operation has a unique operationId', () => {
    const ids = operations.map((operation) => operation.operationId);

    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  interface RouteHandler {
    name: string;
    target: object;
    declarations: string[];
  }

  function routeHandlers(): RouteHandler[] {
    const reflector = app.get(Reflector);
    const handlers: RouteHandler[] = [];

    for (const module of app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype as (new () => object) | null;
        if (!controller?.prototype) continue;

        for (const method of Object.getOwnPropertyNames(controller.prototype)) {
          const handler = (controller.prototype as Record<string, unknown>)[method];
          if (typeof handler !== 'function' || reflector.get(METHOD_METADATA, handler) === undefined) continue;

          const kinds: Array<[symbol, string]> = [
            [IS_PUBLIC_METADATA, 'public'],
            [IS_AUTHENTICATED_ONLY_METADATA, 'authenticated'],
            [REQUIRED_ROLES_METADATA, 'roles'],
          ];
          const own = kinds.filter(([key]) => reflector.get(key, handler) !== undefined).map(([, kind]) => kind);
          const onClass = kinds.filter(([key]) => reflector.get(key, controller) !== undefined).map(([, kind]) => kind);

          handlers.push({
            name: `${controller.name}.${method}`,
            target: handler,
            declarations: own.length > 0 ? own : onClass,
          });
        }
      }
    }

    return handlers;
  }

  it('every route handler declares exactly one access rule', () => {
    const handlers = routeHandlers();

    expect(handlers.length).toBeGreaterThan(0);
    expect(handlers.filter((handler) => handler.declarations.length !== 1).map((handler) => handler.name)).toEqual([]);
  });

  it('the public routes are exactly the allowlist (no registration route exists)', () => {
    const publicRoutes = routeHandlers()
      .filter((handler) => handler.declarations[0] === 'public')
      .map((handler) => handler.name)
      .sort();

    expect(publicRoutes).toEqual([...PUBLIC_ALLOWLIST].sort());
    expect([...API_COVERAGE_MANIFEST].filter((key) => /register|signup|sign-up/i.test(key))).toEqual([]);
  });

  it('the catalog sample is not mounted on HTTP', async () => {
    for (const path of [
      '/api/v1/catalog-applications',
      '/api/v1/catalog-applications/4f24d10d-63ad-49b1-a7a1-c988765990ae',
    ]) {
      await request(app.getHttpServer()).get(path).expect(404);
    }
    await request(app.getHttpServer()).post('/api/v1/catalog-applications').send({}).expect(404);
  });
});
