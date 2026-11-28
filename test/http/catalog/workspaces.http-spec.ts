import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const WORKSPACES = '/api/v1/workspaces';
const VERSION = '2026-12-01T00:00:00.000Z';

describe('workspace routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const send = (method: 'get' | 'post' | 'patch' | 'put', path: string, roles: string[], body?: object) => {
    const req = request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(roles)));

    return body === undefined ? req : req.send(body);
  };

  describe('W3-10: who may call', () => {
    it.each([
      ['list', 'get', WORKSPACES, undefined],
      ['create', 'post', WORKSPACES, { vendorId: ID, name: 'Anthropic' }],
      ['get', 'get', `${WORKSPACES}/${ID}`, undefined],
      ['update', 'patch', `${WORKSPACES}/${ID}`, { expectedUpdatedAt: VERSION, name: 'X' }],
      [
        'admins set',
        'put',
        `${WORKSPACES}/${ID}/admins`,
        { admins: [{ employeeId: ID, role: 'OWNER' }], primaryOwnerEmployeeId: ID, expectedUpdatedAt: VERSION },
      ],
      ['responsible change', 'post', `${WORKSPACES}/${ID}/responsible-it-admin`, { employeeId: ID, reason: 'x' }],
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
      'refuses %s the list and the detail (403): the catalog is read by IT, Finance and the Super Admin',
      async (_name, roles) => {
        for (const path of [WORKSPACES, `${WORKSPACES}/${ID}`]) {
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
      'refuses %s making or changing a workspace or its administrators (403): only an IT Admin does',
      async (_name, roles) => {
        const attempts: Array<() => request.Test> = [
          () => send('post', WORKSPACES, roles, { vendorId: ID, name: 'Anthropic' }),
          () => send('patch', `${WORKSPACES}/${ID}`, roles, { expectedUpdatedAt: VERSION, name: 'X' }),
          () =>
            send('put', `${WORKSPACES}/${ID}/admins`, roles, {
              admins: [{ employeeId: ID, role: 'OWNER' }],
              primaryOwnerEmployeeId: ID,
              expectedUpdatedAt: VERSION,
            }),
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
    ])('refuses %s naming who answers for a workspace (403): only the Super Admin does', async (_name, roles) => {
      const response = await send('post', `${WORKSPACES}/${ID}/responsible-it-admin`, roles, {
        employeeId: OTHER,
        reason: 'Handover',
      }).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    });
  });

  describe('W3-10: what the body and the query must be', () => {
    it.each([
      [
        'a body that names who answers for it (B2-R3)',
        { vendorId: ID, name: 'X', responsibleItAdminEmployeeId: OTHER },
      ],
      ['no vendor', { name: 'X' }],
      ['no name', { vendorId: ID }],
      ['a blank name', { vendorId: ID, name: '   ' }],
      ['a name over 200 characters', { vendorId: ID, name: 'x'.repeat(201) }],
      ['an owner email that is not an email', { vendorId: ID, name: 'X', ownerAccountEmail: 'not-an-email' }],
      ['a password field', { vendorId: ID, name: 'X', password: 'secret' }],
    ])('turns away a creation with %s with 422', async (_name, body) => {
      const response = await send('post', WORKSPACES, ['IT_ADMIN'], body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no version', { name: 'X' }],
      ['a version that is not an instant', { expectedUpdatedAt: 'yesterday', name: 'X' }],
      ['a version and no field to change', { expectedUpdatedAt: VERSION }],
      ['the vendor, which never changes', { expectedUpdatedAt: VERSION, vendorId: OTHER }],
      [
        'the person who answers for it, who is named by the Super Admin only',
        { expectedUpdatedAt: VERSION, responsibleItAdminEmployeeId: OTHER },
      ],
      ['a limit of zero', { expectedUpdatedAt: VERSION, ownerLimit: 0 }],
    ])('turns away a change with %s with 422', async (_name, body) => {
      const response = await send('patch', `${WORKSPACES}/${ID}`, ['IT_ADMIN'], body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no administrators', { admins: [], primaryOwnerEmployeeId: ID, expectedUpdatedAt: VERSION }],
      [
        'a person named twice',
        {
          admins: [
            { employeeId: ID, role: 'OWNER' },
            { employeeId: ID, role: 'ADMIN' },
          ],
          primaryOwnerEmployeeId: ID,
          expectedUpdatedAt: VERSION,
        },
      ],
      [
        'more than twenty administrators',
        {
          admins: Array.from({ length: 21 }, (_, index) => ({
            employeeId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            role: 'ADMIN',
          })),
          primaryOwnerEmployeeId: ID,
          expectedUpdatedAt: VERSION,
        },
      ],
      [
        'a role that is neither owner nor admin',
        { admins: [{ employeeId: ID, role: 'GUEST' }], primaryOwnerEmployeeId: ID, expectedUpdatedAt: VERSION },
      ],
      ['no primary owner', { admins: [{ employeeId: ID, role: 'OWNER' }], expectedUpdatedAt: VERSION }],
      ['no version', { admins: [{ employeeId: ID, role: 'OWNER' }], primaryOwnerEmployeeId: ID }],
    ])('turns away administrators with %s with 422', async (_name, body) => {
      const response = await send('put', `${WORKSPACES}/${ID}/admins`, ['IT_ADMIN'], body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no person', { reason: 'x' }],
      ['no reason', { employeeId: OTHER }],
      ['a blank reason', { employeeId: OTHER, reason: '   ' }],
      ['a reason over 500 characters', { employeeId: OTHER, reason: 'x'.repeat(501) }],
      ['a person that is not a uuid', { employeeId: 'it-1', reason: 'x' }],
    ])('turns away a change of who answers with %s with 422', async (_name, body) => {
      const response = await send('post', `${WORKSPACES}/${ID}/responsible-it-admin`, ['SUPER_ADMIN'], body).expect(
        422,
      );

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a page size over 100', `${WORKSPACES}?pageSize=101`],
      ['a flag nobody knows', `${WORKSPACES}?flag=BROKEN`],
      ['a vendor that is not a uuid', `${WORKSPACES}?vendorId=anthropic`],
      ['a page of zero', `${WORKSPACES}?page=0`],
      ['an id that is not a uuid', `${WORKSPACES}/not-a-uuid`],
    ])('turns away a read with %s with 422', async (_name, path) => {
      const response = await send('get', path, ['IT_ADMIN']).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
