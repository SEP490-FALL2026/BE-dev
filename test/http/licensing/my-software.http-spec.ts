import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TransientDatabaseError } from '../../../src/infrastructure/database/transaction-runner';
import { MySoftwareService } from '../../../src/modules/licensing/my-software/my-software.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const PATH = '/api/v1/me/software-rights';
const RIGHT = {
  assignmentId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
  application: { id: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d12', name: 'Office' },
  plan: { id: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d13', name: 'Office 2021' },
  provisioningType: 'K4',
  status: 'ACTIVE',
  effectiveFrom: '2026-01-05',
  grantedOn: '2026-01-05',
  effectiveFromLabel: null,
  expectedEndDate: null,
  expiringSoon: false,
  validUntil: null,
  successorAssignmentId: null,
};

/**
 * `US-12-15` AC-2, `US-16-01` AC-1: the contract of the list of the caller's own software rights, with the service replaced, so what is
 * proved here is the route: who may call it, what it accepts and the shape and message of its answer. The data is proved on PostgreSQL.
 */
describe('my software rights route (e2e, no database)', () => {
  let app: INestApplication<App>;
  const list = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: MySoftwareService, useValue: { list } }] });
  });

  beforeEach(() => {
    list.mockReset();
    list.mockResolvedValue({
      asOf: '2026-10-23',
      view: 'current',
      page: { items: [RIGHT], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('without a token is 401', async () => {
    const response = await request(app.getHttpServer()).get(PATH).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(list).not.toHaveBeenCalled();
  });

  it.each(['IT_ADMIN', 'FINANCE', 'SUPER_ADMIN', 'SPENDING_APPROVER', 'MANAGER', 'EMPLOYEE'])(
    'reads only the caller data with the single role %s',
    async (role) => {
      await request(app.getHttpServer())
        .get(PATH)
        .set('Authorization', bearer(principal([role], { employeeId: 'e-77' })))
        .expect(200);
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e-77' }), expect.anything());
    },
  );

  it('answers a page for the Employee, read for the caller with the defaults, under its own message', async () => {
    const response = await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', bearer(principal(['EMPLOYEE'], { employeeId: 'e-77' })))
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      message: 'ME.SOFTWARE_RIGHTS_LISTED',
      data: {
        asOf: '2026-10-23',
        view: 'current',
        items: [RIGHT],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
    });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e-77' }), {
      view: 'current',
      page: 1,
      pageSize: 20,
    });
  });

  // US-16-01 AC-6: the rights of a person with several roles are the union of each role.
  it('lets a person with another role who also holds the Employee role read their own list', async () => {
    await request(app.getHttpServer())
      .get(`${PATH}?view=ended&page=2&pageSize=5`)
      .set('Authorization', bearer(principal(['IT_ADMIN', 'EMPLOYEE', 'MANAGER'])))
      .expect(200);

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e1' }), {
      view: 'ended',
      page: 2,
      pageSize: 5,
    });
  });

  it.each([
    ['an unknown view', `${PATH}?view=all`],
    ['page 0', `${PATH}?page=0`],
    ['a page size of 101', `${PATH}?pageSize=101`],
    ['a parameter that names a person', `${PATH}?employeeId=3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11`],
  ])('turns away %s, 422', async (_name, path) => {
    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', bearer(principal(['EMPLOYEE'])))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(list).not.toHaveBeenCalled();
  });

  it('answers 503 when the database cannot answer, without detail', async () => {
    list.mockRejectedValueOnce(new TransientDatabaseError('57P01', new Error('terminating connection')));

    const response = await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', bearer(principal(['EMPLOYEE'])))
      .expect(503);

    expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('terminating');
  });

  it('has no way to write the list', async () => {
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const response = await request(app.getHttpServer())
        [method](PATH)
        .set('Authorization', bearer(principal(['EMPLOYEE'])))
        .send({});
      expect([response.status, bodyOf(response).error.code]).toEqual([404, 'HTTP_NOT_FOUND']);
    }
  });
});
