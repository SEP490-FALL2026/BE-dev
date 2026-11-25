import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const LOTS = '/api/v1/license-lots';
const VERSION = '2026-12-01T00:00:00.000Z';
const CREATE = {
  planId: ID,
  purchasedOn: '2026-12-01',
  licenseCount: 3,
  unitPrice: { amount: '12000000', currency: 'VND' },
  purpose: 'REPLACEMENT',
};

describe('license lot routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const send = (method: 'get' | 'post' | 'patch', path: string, roles: string[], body?: object) => {
    const req = request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(roles)));

    return body === undefined ? req : req.send(body);
  };

  describe('W3-24: who may call', () => {
    it.each([
      ['list', 'get', LOTS, undefined],
      ['create', 'post', LOTS, CREATE],
      ['get', 'get', `${LOTS}/${ID}`, undefined],
      ['update', 'patch', `${LOTS}/${ID}`, { expectedUpdatedAt: VERSION, note: 'x' }],
      ['key import', 'post', `${LOTS}/${ID}/keys`, { keys: ['AAAA-0001'] }],
      ['responsible change', 'post', `${LOTS}/${ID}/responsible-it-admin`, { employeeId: ID, reason: 'x' }],
    ] as const)('answers 401 to %s without a token', async (_name, method, path, body) => {
      const req = request(app.getHttpServer())[method](path);
      const response = await (body === undefined ? req : req.send(body)).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it.each([
      ['an employee', ['EMPLOYEE']],
      ['a department head', ['MANAGER']],
      ['the spending approver', ['SPENDING_APPROVER']],
      ['an account with no role', []],
    ])(
      'refuses %s the list and the detail (403): the lots are read by IT, Finance and the Super Admin',
      async (_name, roles) => {
        for (const path of [LOTS, `${LOTS}/${ID}`]) {
          const response = await send('get', path, roles).expect(403);

          expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
        }
      },
    );

    it.each([
      ['Finance', ['FINANCE']],
      ['the Super Admin', ['SUPER_ADMIN']],
      ['an employee', ['EMPLOYEE']],
    ])(
      'refuses %s making a lot, changing it or putting keys in it (403): only an IT Admin does',
      async (_name, roles) => {
        const attempts: Array<() => request.Test> = [
          () => send('post', LOTS, roles, CREATE),
          () => send('patch', `${LOTS}/${ID}`, roles, { expectedUpdatedAt: VERSION, note: 'x' }),
          () => send('post', `${LOTS}/${ID}/keys`, roles, { keys: ['AAAA-0001'] }),
        ];
        for (const attempt of attempts) {
          const response = await attempt().expect(403);

          expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
        }
      },
    );

    it.each([
      ['an IT Admin, even the one who answers for it', ['IT_ADMIN']],
      ['Finance', ['FINANCE']],
      ['an employee', ['EMPLOYEE']],
    ])('refuses %s naming who answers for a lot (403): only the Super Admin does', async (_name, roles) => {
      const response = await send('post', `${LOTS}/${ID}/responsible-it-admin`, roles, {
        employeeId: OTHER,
        reason: 'Handover',
      }).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    });
  });

  describe('W3-24: what the body and the query must be', () => {
    it.each([
      ['no plan', { ...CREATE, planId: undefined }],
      ['no date of purchase', { ...CREATE, purchasedOn: undefined }],
      ['a date that does not exist', { ...CREATE, purchasedOn: '2026-02-30' }],
      ['no licenses', { ...CREATE, licenseCount: 0 }],
      ['more than ten thousand licenses', { ...CREATE, licenseCount: 10_001 }],
      ['a fraction of a license', { ...CREATE, licenseCount: 1.5 }],
      ['no price', { ...CREATE, unitPrice: undefined }],
      ['a purpose that is made by the move of the data', { ...CREATE, purpose: 'OPENING' }],
      ['a purpose nobody knows', { ...CREATE, purpose: 'GIFT' }],
      [
        'a person who answers for it (it is the one who makes the lot)',
        { ...CREATE, responsibleItAdminEmployeeId: OTHER },
      ],
      ['a blank note', { ...CREATE, note: '   ' }],
    ])('turns away a lot with %s with 422', async (_name, body) => {
      const response = await send('post', LOTS, ['IT_ADMIN'], body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no version', { note: 'x' }],
      ['a version that is not an instant', { expectedUpdatedAt: 'yesterday', note: 'x' }],
      ['a version and nothing to change', { expectedUpdatedAt: VERSION }],
      ['the plan, which never changes', { expectedUpdatedAt: VERSION, planId: OTHER }],
      ['the purpose, which never changes', { expectedUpdatedAt: VERSION, purpose: 'STOCK' }],
      ['the number of licenses, which is changed by buying', { expectedUpdatedAt: VERSION, licenseCount: 9 }],
      [
        'the person who answers for it, who is named by the Super Admin only',
        { expectedUpdatedAt: VERSION, responsibleItAdminEmployeeId: OTHER },
      ],
      ['a contract that is not a uuid', { expectedUpdatedAt: VERSION, contractId: 'c-1' }],
    ])('turns away a change with %s with 422', async (_name, body) => {
      const response = await send('patch', `${LOTS}/${ID}`, ['IT_ADMIN'], body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no key', { keys: [] }],
      [
        'more than two hundred keys',
        { keys: Array.from({ length: 201 }, (_, index) => `KEY-${String(index).padStart(8, '0')}`) },
      ],
      ['a key over 512 characters', { keys: ['K'.repeat(513)] }],
      ['no list of keys', {}],
      ['a cap of zero activations', { keys: ['AAAA-0001'], maxActivations: 0 }],
      ['a negative count of activations used', { keys: ['AAAA-0001'], initialActivationsUsed: -1 }],
      ['a field nobody knows', { keys: ['AAAA-0001'], subscriptionId: ID }],
    ])('turns away a batch of keys with %s with 422', async (_name, body) => {
      const response = await send('post', `${LOTS}/${ID}/keys`, ['IT_ADMIN'], body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no person', { reason: 'x' }],
      ['no reason', { employeeId: OTHER }],
      ['a blank reason', { employeeId: OTHER, reason: '   ' }],
      ['a reason over 500 characters', { employeeId: OTHER, reason: 'x'.repeat(501) }],
      ['a person that is not a uuid', { employeeId: 'it-1', reason: 'x' }],
    ])('turns away a change of who answers with %s with 422', async (_name, body) => {
      const response = await send('post', `${LOTS}/${ID}/responsible-it-admin`, ['SUPER_ADMIN'], body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a page size over 100', `${LOTS}?pageSize=101`],
      ['a plan that is not a uuid', `${LOTS}?planId=windows`],
      ['a page of zero', `${LOTS}?page=0`],
      ['a field nobody knows', `${LOTS}?flag=BROKEN`],
      ['an id that is not a uuid', `${LOTS}/not-a-uuid`],
    ])('turns away a read with %s with 422', async (_name, path) => {
      const response = await send('get', path, ['IT_ADMIN']).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
