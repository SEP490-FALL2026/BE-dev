import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApplication } from './../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from './../src/infrastructure/security/tokens/access-token-verifier.port';
import { CatalogRepo } from './../src/modules/catalog/catalog.repo';
import { ApplicationSlugTakenError } from './../src/modules/catalog/errors/catalog.errors';

const RECORD = {
  id: '4f24d10d-63ad-49b1-a7a1-c988765990ae',
  slug: 'figma',
  name: 'Figma',
  vendor: 'Figma Inc.',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-08-12T10:00:00.000Z'),
};

const WIRE_RECORD = { ...RECORD, createdAt: '2026-08-12T10:00:00.000Z' };
const AUTHORIZATION = 'Bearer test-token';

describe('Catalog applications (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let repo: { findPage: jest.Mock; findById: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    repo = {
      findPage: jest.fn().mockResolvedValue({ rows: [RECORD], totalItems: 1 }),
      findById: jest.fn().mockResolvedValue(RECORD),
      create: jest.fn().mockResolvedValue(RECORD),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      // Stub the verifier so authenticated routes are reachable without a real identity provider.
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue({
        verify: jest.fn().mockResolvedValue({
          issuer: 'https://identity.example.com/realms/internal',
          subject: 'oidc-subject-1',
          email: 'tester@example.com',
        }),
      })
      // Stub the repository so this suite stays database-free, like the rest of the E2E tests.
      .overrideProvider(CatalogRepo)
      .useValue(repo)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('requires authentication', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/catalog-applications')
      .expect(401)
      .expect((response) => {
        expect(response.body).toMatchObject({ success: false, error: { code: 'AUTHENTICATION_REQUIRED' } });
      });
  });

  it('returns a page wrapped in the success envelope', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/catalog-applications')
      .set('authorization', AUTHORIZATION)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          success: true,
          message: 'COMMON.SUCCESS',
          data: {
            items: [WIRE_RECORD],
            pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
          },
        });
      });
  });

  it('coerces and forwards paging and filter parameters', async () => {
    await request(app!.getHttpServer())
      .get('/api/v1/catalog-applications?page=2&pageSize=5&status=UNDER_REVIEW')
      .set('authorization', AUTHORIZATION)
      .expect(200);

    expect(repo.findPage).toHaveBeenCalledWith({ page: 2, pageSize: 5, status: 'UNDER_REVIEW' });
  });

  it('rejects an unknown query parameter', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/catalog-applications?sort=name')
      .set('authorization', AUTHORIZATION)
      .expect(422)
      .expect((response) => {
        expect(response.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
      });
  });

  it('creates an application and answers 201 with its own message key', () => {
    return request(app!.getHttpServer())
      .post('/api/v1/catalog-applications')
      .set('authorization', AUTHORIZATION)
      .send({ slug: 'figma', name: 'Figma', vendor: 'Figma Inc.' })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual({
          success: true,
          message: 'CATALOG.APPLICATION_CREATED',
          data: WIRE_RECORD,
        });
      });
  });

  it('answers 409 with a stable code for a duplicate slug', () => {
    repo.create.mockRejectedValueOnce(new ApplicationSlugTakenError('figma'));

    return request(app!.getHttpServer())
      .post('/api/v1/catalog-applications')
      .set('authorization', AUTHORIZATION)
      .send({ slug: 'figma', name: 'Figma', vendor: 'Figma Inc.' })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: false,
          error: { code: 'CATALOG.APPLICATION_SLUG_TAKEN', details: { slug: 'figma' } },
        });
      });
  });

  it('rejects a body that tries to set server-owned fields', () => {
    return request(app!.getHttpServer())
      .post('/api/v1/catalog-applications')
      .set('authorization', AUTHORIZATION)
      .send({ slug: 'figma', name: 'Figma', vendor: 'Figma Inc.', id: RECORD.id })
      .expect(422)
      .expect((response) => {
        expect(response.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
      });
  });

  it('answers 404 with a stable code for an unknown application', () => {
    repo.findById.mockResolvedValueOnce(null);

    return request(app!.getHttpServer())
      .get(`/api/v1/catalog-applications/${RECORD.id}`)
      .set('authorization', AUTHORIZATION)
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: false,
          error: { code: 'CATALOG.APPLICATION_NOT_FOUND' },
        });
      });
  });

  it('rejects an identifier that is not a UUID before reaching the repository', async () => {
    await request(app!.getHttpServer())
      .get('/api/v1/catalog-applications/not-a-uuid')
      .set('authorization', AUTHORIZATION)
      .expect(422);

    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('does not leak internal record fields', () => {
    // The mapper is the only thing standing between a Prisma row and the client. This is
    // the assertion that fails if somebody ever returns the record directly.
    repo.findById.mockResolvedValueOnce({ ...RECORD, updatedAt: new Date(), internalNote: 'do not ship' });

    return request(app!.getHttpServer())
      .get(`/api/v1/catalog-applications/${RECORD.id}`)
      .set('authorization', AUTHORIZATION)
      .expect(200)
      .expect((response) => {
        const body = response.body as { data: unknown };

        expect(body.data).toEqual(WIRE_RECORD);
        expect(JSON.stringify(body)).not.toContain('do not ship');
      });
  });
});
