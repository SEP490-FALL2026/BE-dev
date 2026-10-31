import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

describe('onboarding checklist route (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('needs a signed-in account', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/onboarding-checklist').expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the finance officer', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])(
    'is not shown to %s: 403 (US-02-04: only the Super Admin, who does step 1, and the IT Admin, who does steps 2 to 5, see the onboarding checklist)',
    async (_name, direct, derived) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/onboarding-checklist')
        .set('Authorization', bearer(principal(direct, derived)))
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    },
  );
});
