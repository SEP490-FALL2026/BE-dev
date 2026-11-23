import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TransferRevocationRefusedError } from '../../../src/modules/personnel/transfer-grace/transfer-revocation.errors';
import { TransferRevocationService } from '../../../src/modules/personnel/transfer-grace/transfer-revocation.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

describe('POST /api/v1/department-transfers/:id/revocations (HTTP contract)', () => {
  let app: INestApplication<App>;
  const reopen = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [{ token: TransferRevocationService, useValue: { reopen } }],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    reopen.mockReset();
  });

  it('requires authentication (401)', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/department-transfers/${ID}/revocations`)
      .expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('forbids SUPER_ADMIN and other non-IT_ADMIN roles (403)', async () => {
    for (const roles of [['SUPER_ADMIN'], ['FINANCE'], ['EMPLOYEE'], []]) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/department-transfers/${ID}/revocations`)
        .set('Authorization', bearer(principal(roles)))
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it('validates the transfer id parameter (422)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/department-transfers/not-a-uuid/revocations')
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 200 with created and reasonAdded counts for IT_ADMIN', async () => {
    reopen.mockResolvedValue({ created: 2, reasonAdded: 1 });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/department-transfers/${ID}/revocations`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(200);

    expect(bodyOf(response).message).toBe('DEPARTMENT_TRANSFER.REVOCATION_REOPENED');
    expect(bodyOf(response).data).toEqual({ created: 2, reasonAdded: 1 });
  });

  it('maps NOT_FOUND to 404', async () => {
    reopen.mockRejectedValue(new TransferRevocationRefusedError('NOT_FOUND'));

    const response = await request(app.getHttpServer())
      .post(`/api/v1/department-transfers/${ID}/revocations`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(404);

    expect(bodyOf(response).error.code).toBe('DEPARTMENT_TRANSFER.NOT_FOUND');
  });

  it.each(['REVOCATION_NOT_DUE', 'NOTHING_TO_REVOKE'] as const)('maps %s to 409', async (code) => {
    reopen.mockRejectedValue(new TransferRevocationRefusedError(code));

    const response = await request(app.getHttpServer())
      .post(`/api/v1/department-transfers/${ID}/revocations`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(409);

    expect(bodyOf(response).error.code).toBe(`DEPARTMENT_TRANSFER.${code}`);
  });
});
