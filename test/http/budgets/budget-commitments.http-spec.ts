import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { CommitmentService } from '../../../src/modules/budgets/commitment/commitment.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

describe('GET /budget-commitments (HTTP contract, no database)', () => {
  let app: INestApplication<App>;
  const page = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: CommitmentService, useValue: { page } }] });
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
    const response = await request(app.getHttpServer()).get('/api/v1/budget-commitments').expect(401);
    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('refuses every role but Finance with 403 and reads nothing', async () => {
    for (const roles of [['MANAGER'], ['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN'], ['SPENDING_APPROVER'], []]) {
      const response = await request(app.getHttpServer())
        .get('/api/v1/budget-commitments?state=HELD')
        .set('Authorization', bearer(principal(roles)))
        .expect(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(page).not.toHaveBeenCalled();
  });

  it.each([['PENDING'], ['held'], ['']])('turns away the state %p with 422', async (state) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/budget-commitments')
      .query({ state })
      .set('Authorization', bearer(principal(['FINANCE'])))
      .expect(422);
    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(page).not.toHaveBeenCalled();
  });

  it.each([['HELD'], ['RELEASED'], ['EXPENSED']])('narrows the list to the state %s', async (state) => {
    await request(app.getHttpServer())
      .get('/api/v1/budget-commitments')
      .query({ state })
      .set('Authorization', bearer(principal(['FINANCE'])))
      .expect(200);

    expect(page).toHaveBeenCalledWith(expect.objectContaining({ state }));
  });

  it('does not narrow the list when no state is given', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/budget-commitments')
      .set('Authorization', bearer(principal(['FINANCE'])))
      .expect(200);

    expect(page).toHaveBeenCalledWith(expect.not.objectContaining({ state: expect.anything() as unknown }));
  });
});
