import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { SpendBatchListService } from '../../../src/modules/requests/spend-submission/spend-batch-list.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const DEPARTMENT = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

describe('GET /spend-batches (HTTP contract, no database)', () => {
  let app: INestApplication<App>;
  const page = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: SpendBatchListService, useValue: { page } }] });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    page.mockReset().mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
  });

  it('answers 401 without a token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/spend-batches').expect(401);
    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('refuses every role but Finance with 403 and reads nothing', async () => {
    for (const roles of [['MANAGER'], ['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN'], ['SPENDING_APPROVER'], []]) {
      const response = await request(app.getHttpServer())
        .get('/api/v1/spend-batches')
        .set('Authorization', bearer(principal(roles)))
        .expect(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(page).not.toHaveBeenCalled();
  });

  it.each([
    ['a department that is not an id', { departmentId: 'engineering' }],
    ['a time that is not an instant', { submittedFrom: 'yesterday' }],
    [
      'a window that ends before it starts',
      { submittedFrom: '2026-11-06T00:00:00Z', submittedTo: '2026-11-05T00:00:00Z' },
    ],
    ['a page size above 100', { pageSize: 101 }],
    ['a page that is not positive', { page: 0 }],
    ['an unknown parameter', { requestId: DEPARTMENT }],
  ])('turns away %s with 422', async (_name, query) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/spend-batches')
      .query(query)
      .set('Authorization', bearer(principal(['FINANCE'])))
      .expect(422);
    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(page).not.toHaveBeenCalled();
  });

  it('gives Finance the page in the envelope and passes the narrowing on', async () => {
    const entry = {
      id: '4f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22',
      department: { id: DEPARTMENT, name: 'Engineering' },
      submittedBy: { employeeId: '5f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d33', employeeCode: 'NV-1', fullName: 'An Nguyen' },
      submittedAt: '2026-11-05T02:00:00.000Z',
      itemCount: 3,
      approvedCount: 2,
      pendingCount: 1,
      approvedAmounts: { VND: '4000' },
    };
    page.mockResolvedValue({ items: [entry], pagination: { page: 2, pageSize: 5, totalItems: 6, totalPages: 2 } });

    const response = await request(app.getHttpServer())
      .get('/api/v1/spend-batches')
      .query({ departmentId: DEPARTMENT, submittedFrom: '2026-11-01T00:00:00Z', page: 2, pageSize: 5 })
      .set('Authorization', bearer(principal(['FINANCE'])))
      .expect(200);

    const body = response.body as { success: boolean; message: string; data: { items: unknown[] } };
    expect(body.success).toBe(true);
    expect(body.message).toBe('SPEND_BATCH.LISTED');
    expect(body.data.items).toEqual([entry]);
    expect(page).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: DEPARTMENT,
        submittedFrom: '2026-11-01T00:00:00Z',
        page: 2,
        pageSize: 5,
      }),
    );
  });
});
