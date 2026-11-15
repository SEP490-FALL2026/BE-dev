import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const CREATE = {
  year: 2031,
  submissionDeadline: '2030-12-01',
  decisionDeadline: '2030-12-15',
  annualCeiling: { amount: '1000' },
  sharedPoolReserve: { amount: '100' },
};

/** `QĐ-111z`, `QĐ-111aa`: the routes of the budget cycle (contract, no database): who may call, what the validation turns away, and the routes that are gone. */
describe('budget cycle routes (HTTP contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const routes = [
    ['post', '/api/v1/budget-cycles', CREATE],
    ['get', '/api/v1/budget-cycles', undefined],
    ['get', '/api/v1/budget-cycles/2031', undefined],
    ['get', '/api/v1/budget-cycles/2031/baseline', undefined],
    ['get', '/api/v1/budget-cycles/2031/package', undefined],
    ['patch', '/api/v1/budget-cycles/2031', { priorities: 'x' }],
    ['delete', '/api/v1/budget-cycles/2031', undefined],
    ['post', '/api/v1/budget-cycles/2031/opening', undefined],
  ] as const;

  it.each(routes)('answers 401 to %s %s without a token', async (method, path, body) => {
    const req = request(app.getHttpServer())[method](path);
    const response = await (body === undefined ? req : req.send(body)).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('refuses the routes that write to every role but Finance with 403', async () => {
    const writes = routes.filter(([method]) => method !== 'get');
    for (const roles of [['SUPER_ADMIN'], ['IT_ADMIN'], ['EMPLOYEE'], ['MANAGER'], ['SPENDING_APPROVER'], []]) {
      for (const [method, path, body] of writes) {
        const req = request(app.getHttpServer())
          [method](path)
          .set('Authorization', bearer(principal(roles)));
        const response = await (body === undefined ? req : req.send(body)).expect(403);

        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      }
    }
  });

  it('refuses the reads of the cycle and of its package to every role but Finance and the spending approver with 403', async () => {
    for (const roles of [['SUPER_ADMIN'], ['IT_ADMIN'], ['EMPLOYEE'], ['MANAGER'], []]) {
      for (const path of [
        '/api/v1/budget-cycles',
        '/api/v1/budget-cycles/2031',
        '/api/v1/budget-cycles/2031/package',
      ]) {
        const response = await request(app.getHttpServer())
          .get(path)
          .set('Authorization', bearer(principal(roles)))
          .expect(403);

        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      }
    }
  });

  it.each([
    ['a year that is not a number', 'get', '/api/v1/budget-cycles/next', undefined],
    ['a year out of range', 'get', '/api/v1/budget-cycles/1999', undefined],
    ['page 0', 'get', '/api/v1/budget-cycles?page=0', undefined],
    ['a page size of 101', 'get', '/api/v1/budget-cycles?pageSize=101', undefined],
    ['a baseline of a year that is not a number', 'get', '/api/v1/budget-cycles/next/baseline', undefined],
    [
      'a baseline of a department that is not an id',
      'get',
      '/api/v1/budget-cycles/2031/baseline?departmentId=x',
      undefined,
    ],
    ['a package of a year out of range', 'get', '/api/v1/budget-cycles/1999/package', undefined],
    ['a draft with no ceiling', 'post', '/api/v1/budget-cycles', { ...CREATE, annualCeiling: undefined }],
    ['a draft with no reserve', 'post', '/api/v1/budget-cycles', { ...CREATE, sharedPoolReserve: undefined }],
    [
      'a draft that names a currency',
      'post',
      '/api/v1/budget-cycles',
      { ...CREATE, annualCeiling: { amount: '1', currency: 'USD' } },
    ],
    ['a draft with an unknown field', 'post', '/api/v1/budget-cycles', { ...CREATE, extra: 1 }],
    ['a deadline that is not a date', 'patch', '/api/v1/budget-cycles/2031', { submissionDeadline: '2030-13-40' }],
    [
      'a reserve that names a currency',
      'patch',
      '/api/v1/budget-cycles/2031',
      { sharedPoolReserve: { amount: '1', currency: 'USD' } },
    ],
    ['a deletion of a year out of range', 'delete', '/api/v1/budget-cycles/1999', undefined],
    ['an opening of a year that is not a number', 'post', '/api/v1/budget-cycles/next/opening', undefined],
  ] as const)('turns away %s with 422', async (_name, method, path, body) => {
    const req = request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(['FINANCE'])));

    const response = await (body === undefined ? req : req.send(body)).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['divide the annual ceiling among the departments', 'put', '/api/v1/budget-cycles/2031/department-ceilings'],
    ['publish the division', 'post', '/api/v1/budget-cycles/2031/publish'],
  ] as const)('no longer has the route to %s (QĐ-111aa)', async (_name, method, path) => {
    await request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(['FINANCE'])))
      .expect(404);
  });
});
