import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { HR_BASIS } from '../../support/hr-basis';

const SUPER_ADMIN = principal(['SUPER_ADMIN']);

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

let app: INestApplication<App>;

beforeAll(async () => {
  app = await createHttpContractApp();
});

afterAll(async () => {
  await app?.close();
});

describe('POST /api/v1/employees (e2e, no database)', () => {
  const post = (body: unknown, caller = SUPER_ADMIN) =>
    request(app.getHttpServer())
      .post('/api/v1/employees')
      .set('Authorization', bearer(caller))
      .send(body as object);

  it('requires a Bearer token', async () => {
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
    const response = await post(VALID, principal(direct, derived)).expect(403);

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
      ['a catalogue entry for the title, which is free text now (QĐ-87e)', { ...VALID, jobTitleId: 'X' }],
      ['a job title that is not text', { ...VALID, jobTitle: 42 }],
      ['a job title longer than the form takes', { ...VALID, jobTitle: 'x'.repeat(1001) }],
    ])('turns away a request with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await post(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});

describe('PATCH /api/v1/employees/{id} (e2e, no database)', () => {
  const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
  const CHANGE = { fullName: 'Nguyễn Văn A', hrBasis: HR_BASIS };

  const patch = (path: string, body: unknown, caller = SUPER_ADMIN) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', bearer(caller))
      .send(body as object);

  it('requires a Bearer token', async () => {
    const response = await request(app.getHttpServer()).patch(`/api/v1/employees/${ID}`).send(CHANGE).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the IT Admin, who keeps the technical work only and no longer corrects records (F10, QĐ-87a)', ['IT_ADMIN'], []],
    ['the finance officer', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
  ])('refuses %s with 403', async (_name, direct, derived) => {
    const response = await patch(`/api/v1/employees/${ID}`, CHANGE, principal(direct, derived)).expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['no HR basis', { fullName: 'A' }],
    ['an HR basis without an issuer', { fullName: 'A', hrBasis: { ...HR_BASIS, issuer: undefined } }],
    ['a field that is not an official one', { ...CHANGE, departmentCode: 'P-OPS' }],
    ['a status', { ...CHANGE, status: 'TERMINATED' }],
    ['a hire date that is not a date', { ...CHANGE, hireDate: '2026-02-30' }],
    ['an unknown kind of staff', { ...CHANGE, employmentType: 'BOSS' }],
    ['a catalogue entry for the title, which is free text now (QĐ-87e)', { ...CHANGE, jobTitleId: 'X' }],
    ['a job title that is not text', { ...CHANGE, jobTitle: 42 }],
    ['a job title longer than the form takes', { ...CHANGE, jobTitle: 'x'.repeat(1001) }],
  ])('turns away a request with %s, 422 VALIDATION_ERROR', async (_name, body) => {
    expect(bodyOf(await patch(`/api/v1/employees/${ID}`, body).expect(422)).error.code).toBe('VALIDATION_ERROR');
  });

  it('turns away an id that is not a UUID, 422 VALIDATION_ERROR', async () => {
    expect(bodyOf(await patch('/api/v1/employees/not-an-id', CHANGE).expect(422)).error.code).toBe('VALIDATION_ERROR');
  });
});
