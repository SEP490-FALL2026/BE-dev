import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApplication, createOpenApiDocument } from '../../src/bootstrap';
import { API_COVERAGE_MANIFEST } from '../support/api-coverage-manifest';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

describe('API inventory (e2e)', () => {
  let app: INestApplication;
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

  it('G01/B1a — the operations exported in OpenAPI are exactly the operations in the coverage manifest', () => {
    const exported = operations.map((operation) => operation.key).sort();
    const manifest = [...API_COVERAGE_MANIFEST].sort();

    // Set equality, never a count: an operation added without a manifest entry, or a manifest
    // entry whose operation was removed, must each fail here.
    expect(exported).toEqual(manifest);
  });

  it('G01/B1a — every exported operation has a unique operationId', () => {
    const ids = operations.map((operation) => operation.operationId);

    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
