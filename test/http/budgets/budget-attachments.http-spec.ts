import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const ATTACHMENT_ID = '4f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22';

describe('budget attachment routes (HTTP contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['post', `/api/v1/budget-versions/${ID}/attachments`],
    ['post', '/api/v1/budget-proposals/attachments'],
    ['post', `/api/v1/budget-attachments/${ID}/complete`],
    ['post', `/api/v1/budget-versions/${ID}/attachments/${ATTACHMENT_ID}/removal`],
    ['get', `/api/v1/budget-proposals/${ID}/attachments`],
    ['get', `/api/v1/budget-versions/${ID}/attachments`],
    ['post', `/api/v1/budget-attachments/${ID}/links`],
    ['get', '/api/v1/budget-attachments/mine'],
    ['post', `/api/v1/budget-attachments/${ID}/discard`],
    ['get', '/api/v1/budgets/mine/versions'],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);
    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('refuses non-Finance roles for version attachment declaration with 403', async () => {
    const server = app.getHttpServer();
    for (const roles of [['MANAGER'], ['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN'], []]) {
      const res = await request(server)
        .post(`/api/v1/budget-versions/${ID}/attachments`)
        .set('Authorization', bearer(principal(roles)))
        .send({ fileName: 'file.pdf', contentType: 'application/pdf', sizeBytes: 1024 })
        .expect(403);
      expect(bodyOf(res).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it('refuses non-Manager roles for proposal attachment declaration with 403', async () => {
    const server = app.getHttpServer();
    for (const roles of [['FINANCE'], ['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN'], []]) {
      const res = await request(server)
        .post('/api/v1/budget-proposals/attachments')
        .set('Authorization', bearer(principal(roles)))
        .send({ fileName: 'file.pdf', contentType: 'application/pdf', sizeBytes: 1024 })
        .expect(403);
      expect(bodyOf(res).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it('refuses non-Finance roles for version attachment removal with 403', async () => {
    const server = app.getHttpServer();
    for (const roles of [['MANAGER'], ['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN'], []]) {
      const res = await request(server)
        .post(`/api/v1/budget-versions/${ID}/attachments/${ATTACHMENT_ID}/removal`)
        .set('Authorization', bearer(principal(roles)))
        .expect(403);
      expect(bodyOf(res).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it('refuses non-Manager roles for mine versions with 403', async () => {
    const server = app.getHttpServer();
    for (const roles of [['FINANCE'], ['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN'], []]) {
      const res = await request(server)
        .get('/api/v1/budgets/mine/versions')
        .set('Authorization', bearer(principal(roles)))
        .expect(403);
      expect(bodyOf(res).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it.each([
    [
      'a declaration with non-uuid version id',
      'post',
      '/api/v1/budget-versions/not-a-uuid/attachments',
      ['FINANCE'],
      { fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 100 },
    ],
    [
      'a declaration with unknown extra property',
      'post',
      `/api/v1/budget-versions/${ID}/attachments`,
      ['FINANCE'],
      { fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 100, extra: true },
    ],
    [
      'a proposal declaration with missing fileName',
      'post',
      '/api/v1/budget-proposals/attachments',
      ['MANAGER'],
      { contentType: 'application/pdf', sizeBytes: 100 },
    ],
    [
      'complete with non-uuid attachment id',
      'post',
      '/api/v1/budget-attachments/not-a-uuid/complete',
      ['FINANCE'],
      undefined,
    ],
    [
      'removal with non-uuid attachment id',
      'post',
      `/api/v1/budget-versions/${ID}/attachments/not-a-uuid/removal`,
      ['FINANCE'],
      undefined,
    ],
    ['link with non-uuid attachment id', 'post', '/api/v1/budget-attachments/not-a-uuid/links', ['FINANCE'], undefined],
    [
      'discard with non-uuid attachment id',
      'post',
      '/api/v1/budget-attachments/not-a-uuid/discard',
      ['FINANCE'],
      undefined,
    ],
  ] as const)('turns away %s with 422', async (_name, method, path, roles, body) => {
    const req = request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(roles)));

    const response = await (body === undefined ? req : req.send(body)).expect(422);
    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['submit', 'post', '/api/v1/budget-proposals'],
    ['resubmit', 'post', `/api/v1/budget-proposals/${ID}/resubmission`],
  ] as const)('turns away %s with 21 or repeated attachmentIds with 422 (limits)', async (_name, method, path) => {
    const server = app.getHttpServer();
    const line = {
      description: 'Figma',
      amount: { amount: '1000', currency: 'VND' },
      windowFrom: '2027-01-01',
      windowTo: '2027-12-31',
      servicePeriodMonths: 12,
      repeatCycle: 'ANNUAL',
    };
    const base =
      method === 'post' && path.endsWith('resubmission')
        ? { lines: [line] }
        : { costCenterId: ID, year: 2027, lines: [line] };
    const ids = Array.from({ length: 21 }, (_, i) => `4f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c00${String(i).padStart(2, '0')}`);
    for (const attachmentIds of [ids, [ids[0], ids[0]]]) {
      const response = await request(server)
        [method](path)
        .set('Authorization', bearer(principal(['MANAGER'])))
        .send({ ...base, attachmentIds })
        .expect(422);
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('has no route that adds or removes the documents of a proposal (US-06-10 AC-16)', async () => {
    const server = app.getHttpServer();
    const as = (req: request.Test) => req.set('Authorization', bearer(principal(['MANAGER'])));

    await as(request(server).post(`/api/v1/budget-proposals/${ID}/attachments`).send({})).expect(404);
    await as(request(server).delete(`/api/v1/budget-proposals/${ID}/attachments/${ATTACHMENT_ID}`)).expect(404);
  });

  it('has no route that deletes or modifies attachments directly through unsupported HTTP verbs', async () => {
    const server = app.getHttpServer();
    const as = (req: request.Test) => req.set('Authorization', bearer(principal(['FINANCE'])));

    await as(request(server).delete(`/api/v1/budget-attachments/${ID}`)).expect(404);
    await as(request(server).patch(`/api/v1/budget-attachments/${ID}`).send({})).expect(404);
    await as(request(server).put(`/api/v1/budget-attachments/${ID}`).send({})).expect(404);
  });
});
