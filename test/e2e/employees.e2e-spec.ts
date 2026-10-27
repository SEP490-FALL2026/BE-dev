import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';
import { HR_BASIS } from '../support/hr-basis';

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
  jobTitle: 'Administrator',
  hrBasis: HR_BASIS,
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
    app = await appFor(principal(['SUPER_ADMIN']));

    const response = await request(app.getHttpServer()).post('/api/v1/employees').send(VALID).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the IT Admin, who no longer enters people (QĐ-82i)', ['IT_ADMIN'], []],
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
      ['no HR basis', { ...VALID, hrBasis: undefined }],
      ['an HR basis without a type', { ...VALID, hrBasis: { ...HR_BASIS, type: undefined } }],
      ['an HR basis without a reference', { ...VALID, hrBasis: { ...HR_BASIS, reference: '' } }],
      ['an HR basis without an issuer', { ...VALID, hrBasis: { ...HR_BASIS, issuer: undefined } }],
      ['an HR basis whose date is not a date', { ...VALID, hrBasis: { ...HR_BASIS, issuedOn: '2026-13-01' } }],
      ['an HR basis with a field it does not have', { ...VALID, hrBasis: { ...HR_BASIS, file: 'x' } }],
      ['a cost center sent by the client', { ...VALID, costCenterId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' }],
    ])('turns away a request with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      app = await appFor(principal(['SUPER_ADMIN']));

      const response = await post(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});

describe('PATCH /api/v1/employees/{id} (e2e, no database)', () => {
  let app: INestApplication<App>;
  const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
  const CHANGE = { fullName: 'Nguyễn Văn A', hrBasis: HR_BASIS };

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

  const patch = (path: string, body: unknown) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', 'Bearer any')
      .send(body as object);

  afterEach(async () => {
    await app?.close();
  });

  it('requires a Bearer token', async () => {
    app = await appFor(principal(['IT_ADMIN']));

    const response = await request(app.getHttpServer()).patch(`/api/v1/employees/${ID}`).send(CHANGE).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the Super Admin, who only creates records (QĐ-82m)', ['SUPER_ADMIN'], []],
    ['the finance officer', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
  ])('refuses %s with 403', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));

    const response = await patch(`/api/v1/employees/${ID}`, CHANGE).expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['no HR basis', { fullName: 'A' }],
    ['an HR basis without an issuer', { fullName: 'A', hrBasis: { ...HR_BASIS, issuer: undefined } }],
    ['a field that is not an official one', { ...CHANGE, departmentCode: 'P-OPS' }],
    ['a status', { ...CHANGE, status: 'TERMINATED' }],
    ['a hire date that is not a date', { ...CHANGE, hireDate: '2026-02-30' }],
    ['an unknown kind of staff', { ...CHANGE, employmentType: 'BOSS' }],
  ])('turns away a request with %s, 422 VALIDATION_ERROR', async (_name, body) => {
    app = await appFor(principal(['IT_ADMIN']));

    expect(bodyOf(await patch(`/api/v1/employees/${ID}`, body).expect(422)).error.code).toBe('VALIDATION_ERROR');
  });

  it('turns away an id that is not a UUID, 422 VALIDATION_ERROR', async () => {
    app = await appFor(principal(['IT_ADMIN']));

    expect(bodyOf(await patch('/api/v1/employees/not-an-id', CHANGE).expect(422)).error.code).toBe('VALIDATION_ERROR');
  });
});
