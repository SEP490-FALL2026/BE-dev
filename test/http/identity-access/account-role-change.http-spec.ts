import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AccountStatusService } from '../../../src/modules/identity-access/accounts/app-users/account-status.service';
import { AccountQueryService } from '../../../src/modules/identity-access/accounts/app-users/account-query.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const id = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const path = `/api/v1/app-users/${id}/role`;
describe('changing the account role over HTTP', () => {
  let app: INestApplication<App>;
  const changeRole = jest.fn().mockResolvedValue(undefined);
  const getAccount = jest.fn().mockResolvedValue({
    id,
    loginEmail: 'person@example.test',
    status: 'ACTIVE',
    activationState: 'ACTIVATED',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    employee: null,
    roles: ['MANAGER'],
    roleHistory: [],
    roleHistoryHasMore: false,
    invitation: null,
  });
  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: AccountStatusService, useValue: { changeRole } },
        { token: AccountQueryService, useValue: { getAccount } },
      ],
    });
  });
  beforeEach(() => {
    changeRole.mockClear();
    getAccount.mockClear();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('requires authentication', async () => {
    await request(app.getHttpServer()).put(path).send({ role: 'MANAGER' }).expect(401);
    expect(changeRole).not.toHaveBeenCalled();
  });
  it.each(['EMPLOYEE', 'IT_ADMIN', 'FINANCE', 'MANAGER', 'SPENDING_APPROVER'])('refuses role %s', async (role) => {
    await request(app.getHttpServer())
      .put(path)
      .set('Authorization', bearer(principal([role])))
      .send({ role: 'MANAGER' })
      .expect(403);
    expect(changeRole).not.toHaveBeenCalled();
  });
  it('returns the account detail and ROLE.CHANGED message for the Super Admin', async () => {
    const response = await request(app.getHttpServer())
      .put(path)
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .send({ role: 'MANAGER' })
      .expect(200);
    expect(bodyOf(response)).toMatchObject({ message: 'ROLE.CHANGED', data: { id, roles: ['MANAGER'] } });
    expect(changeRole).toHaveBeenCalledWith(expect.objectContaining({ appUserId: 'u1' }), id, 'MANAGER');
  });
  it.each([{}, { roles: ['MANAGER'] }, { role: 'OWNER' }, { role: 'MANAGER', extra: true }])(
    'refuses invalid body %j',
    async (body) => {
      await request(app.getHttpServer())
        .put(path)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .send(body)
        .expect(422);
      expect(changeRole).not.toHaveBeenCalled();
    },
  );
});
