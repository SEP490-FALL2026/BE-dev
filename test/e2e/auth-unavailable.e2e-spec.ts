import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { bodyOf } from '../support/api-body';
import { App } from 'supertest/types';

/**
 * The database is genuinely unreachable (connection refused), so nothing is stubbed at the
 * repository: this is the real failure path. A caller must be told to retry (503), never that
 * their credentials are wrong (401), and must learn nothing about the infrastructure.
 */
describe('authentication while the database is down (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  const previous = process.env.TEST_DATABASE_URL;

  beforeAll(async () => {
    // Port 1 refuses connections immediately. Set before AppModule is first imported, because
    // ConfigModule validates the environment at import time.
    process.env.TEST_DATABASE_URL = 'postgresql://app:unused@127.0.0.1:1/none_test';
    const { AppModule } = await import('../../src/app.module');
    const { configureApplication } = await import('../../src/bootstrap');
    const { TokenService } = await import('../../src/modules/identity-access/auth/token.service');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApplication(app, { mountDocs: false });
    await app.init();
    // A genuinely valid token: the signature is fine, only the session lookup cannot run.
    accessToken = (
      await app.get(TokenService).signAccessToken({
        sub: '4f24d10d-63ad-49b1-a7a1-c988765990ae',
        sid: '5f24d10d-63ad-49b1-a7a1-c988765990ae',
      })
    ).token;
  }, 60000);

  afterAll(async () => {
    await app?.close();
    if (previous === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = previous;
  });

  const noLeak = (body: unknown): void => {
    const wire = JSON.stringify(body);
    for (const fragment of ['ECONNREFUSED', '127.0.0.1', 'prisma', 'Prisma', 'connect']) {
      expect(wire).not.toContain(fragment);
    }
  };

  it('login answers 503 AUTH.UNAVAILABLE, not 401', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@acme.vn', password: 'whatever password' })
      .expect(503);

    expect(bodyOf(response)).toMatchObject({ success: false, error: { code: 'AUTH.UNAVAILABLE' } });
    noLeak(bodyOf(response));
  });

  it('refresh answers 503 and keeps the cookie so the client can retry', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `slm_refresh=${'A'.repeat(43)}`)
      .expect(503);

    expect(bodyOf(response).error.code).toBe('AUTH.UNAVAILABLE');
    expect(response.headers['set-cookie']).toBeUndefined();
    noLeak(bodyOf(response));
  });

  it('logout answers 503 and does not claim the user is signed out', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', `slm_refresh=${'A'.repeat(43)}`)
      .expect(503);

    expect(bodyOf(response).error.code).toBe('AUTH.UNAVAILABLE');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('a valid token gets 503 TOKEN_VERIFICATION_UNAVAILABLE, not 401', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(503);

    expect(bodyOf(response)).toMatchObject({ success: false, error: { code: 'TOKEN_VERIFICATION_UNAVAILABLE' } });
    noLeak(bodyOf(response));
  });

  it('logout without a cookie needs no database and stays 204', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(204);
  });
});
