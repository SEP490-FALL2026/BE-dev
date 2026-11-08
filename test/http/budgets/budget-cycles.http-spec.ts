import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const DEPARTMENT = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OPEN = {
  year: 2031,
  submissionDeadline: '2030-12-01',
  decisionDeadline: '2030-12-15',
  annualCeiling: { amount: '1000' },
};
const DIVISION = {
  sharedPoolReserve: { amount: '0' },
  departments: [
    {
      departmentId: DEPARTMENT,
      signedCommitments: { amount: '1' },
      plannedSeats: { amount: '0' },
      priority: { amount: '0' },
    },
  ],
};

/** `QĐ-103i`: the routes of the budget cycle (contract, no database): who may call, and what the validation turns away. */
describe('budget cycle routes (HTTP contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const routes = [
    ['post', '/api/v1/budget-cycles', OPEN],
    ['get', '/api/v1/budget-cycles', undefined],
    ['get', '/api/v1/budget-cycles/2031', undefined],
    ['patch', '/api/v1/budget-cycles/2031', { priorities: 'x' }],
    ['put', '/api/v1/budget-cycles/2031/department-ceilings', DIVISION],
    ['post', '/api/v1/budget-cycles/2031/publish', undefined],
  ] as const;

  it.each(routes)('answers 401 to %s %s without a token', async (method, path, body) => {
    const req = request(app.getHttpServer())[method](path);
    const response = await (body === undefined ? req : req.send(body)).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('refuses the four routes that write to every role but Finance with 403', async () => {
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

  it('refuses the two reads to every role but Finance and the spending approver with 403', async () => {
    for (const roles of [['SUPER_ADMIN'], ['IT_ADMIN'], ['EMPLOYEE'], ['MANAGER'], []]) {
      for (const path of ['/api/v1/budget-cycles', '/api/v1/budget-cycles/2031']) {
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
    ['an opening with no ceiling', 'post', '/api/v1/budget-cycles', { ...OPEN, annualCeiling: undefined }],
    [
      'an opening that names a currency',
      'post',
      '/api/v1/budget-cycles',
      { ...OPEN, annualCeiling: { amount: '1', currency: 'USD' } },
    ],
    ['an opening with an unknown field', 'post', '/api/v1/budget-cycles', { ...OPEN, extra: 1 }],
    ['a deadline that is not a date', 'patch', '/api/v1/budget-cycles/2031', { submissionDeadline: '2030-13-40' }],
    ['a division with no reserve', 'put', '/api/v1/budget-cycles/2031/department-ceilings', { departments: [] }],
    [
      'a division that names a department twice',
      'put',
      '/api/v1/budget-cycles/2031/department-ceilings',
      { ...DIVISION, departments: [DIVISION.departments[0], DIVISION.departments[0]] },
    ],
    [
      'an explanation that is empty',
      'put',
      '/api/v1/budget-cycles/2031/department-ceilings',
      { ...DIVISION, departments: [{ ...DIVISION.departments[0], explanation: '  ' }] },
    ],
  ] as const)('turns away %s with 422', async (_name, method, path, body) => {
    const req = request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(['FINANCE'])));

    const response = await (body === undefined ? req : req.send(body)).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
