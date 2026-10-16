import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

function principal(direct: string[], derived: string[] = []) {
  return {
    subject: 'u1',
    appUserId: 'u1',
    sessionId: 's1',
    employeeId: 'e1',
    directRoles: direct,
    derivedRoles: derived,
    roles: [...direct, ...derived],
  };
}

const VALID = {
  employeeCode: 'E-100',
  fullName: 'Nguyen Van A',
  workEmail: 'a@acme.vn',
  employmentType: 'STAFF',
  hireDate: '2026-10-01',
  departmentCode: 'P-OPS',
  jobTitleId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
};

describe('POST /api/v1/employees (e2e, no database)', () => {
  let app: INestApplication<App>;

  async function appFor(identity: ReturnType<typeof principal>): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue({ verify: jest.fn().mockResolvedValue(identity) })
      .compile();
    const created = moduleRef.createNestApplication<INestApplication<App>>();
    configureApplication(created, { mountDocs: false });
    await created.init();

    return created;
  }

  const post = (body: unknown) =>
    request(app.getHttpServer())
      .post('/api/v1/employees')
      .set('Authorization', 'Bearer any')
      .send(body as object);

  afterEach(async () => {
    await app?.close();
  });

  it('requires a Bearer token', async () => {
    app = await appFor(principal(['IT_ADMIN']));

    const response = await request(app.getHttpServer()).post('/api/v1/employees').send(VALID).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['the finance officer', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
  ])('refuses %s with 403', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));

    const response = await post(VALID).expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  describe('validation', () => {
    it.each([
      ['no employee code', { ...VALID, employeeCode: undefined }],
      ['an empty employee code', { ...VALID, employeeCode: '  ' }],
      ['no full name', { ...VALID, fullName: undefined }],
      ['no employment type', { ...VALID, employmentType: undefined }],
      ['an employment type that is not one', { ...VALID, employmentType: 'BOSS' }],
      ['no hire date', { ...VALID, hireDate: undefined }],
      ['a hire date that is not a date', { ...VALID, hireDate: '2026-02-30' }],
      ['a hire date in the wrong shape', { ...VALID, hireDate: '01/10/2026' }],
      ['a work email that is not an email', { ...VALID, workEmail: 'not an email' }],
      ['a work email whose name is only a tag, which cannot be normalized', { ...VALID, workEmail: '+x@acme.vn' }],
      ['an unknown field', { ...VALID, roles: ['SUPER_ADMIN'] }],
      ['a cost center sent by the client', { ...VALID, costCenterId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' }],
    ])('turns away a request with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await post(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
