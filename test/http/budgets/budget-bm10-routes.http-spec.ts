import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

/**
 * `BM-10` is a file and an amount, and a version is one figure for the year (B-6): the routes of the lines of a proposal, of the lines
 * of a version, of their file and of the lines of the budget of a department are gone, whoever calls them.
 */
describe('the routes of the budget lines (HTTP contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['list the lines of a proposal', 'get', `/api/v1/budget-proposals/${ID}/lines`, 'MANAGER'],
    ['list the lines of a version', 'get', `/api/v1/budget-versions/${ID}/lines`, 'FINANCE'],
    ['add lines to a version', 'post', `/api/v1/budget-versions/${ID}/lines`, 'FINANCE'],
    ['change a line of a version', 'put', `/api/v1/budget-versions/${ID}/lines/1`, 'FINANCE'],
    ['load lines into a version from a file', 'post', `/api/v1/budget-versions/${ID}/imports`, 'FINANCE'],
    ['list the lines of the budget of my department', 'get', '/api/v1/budgets/mine/lines?year=2027', 'MANAGER'],
  ] as const)('no longer has the route to %s (B-6)', async (_name, method, path, role) => {
    await request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal([role])))
      .expect(404);
  });

  const ids = (count: number) =>
    Array.from({ length: count }, (_, index) => `3f0c7d54-9e1b-4f6a-8d2c-${String(index).padStart(12, '0')}`);
  const bm10 = { requestedAmount: { amount: '70000000' }, attachmentIds: ids(1) };

  describe.each([
    ['budgetProposalSubmit', '/api/v1/budget-proposals', { year: 2027, ...bm10 }],
    ['budgetProposalResubmit', `/api/v1/budget-proposals/${ID}/resubmission`, bm10],
  ] as const)('%s takes BM-10: files, one amount and a note (QĐ-111ab)', (_operation, path, body) => {
    const send = (over: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post(path)
        .set('Authorization', bearer(principal(['MANAGER'])))
        .send({ ...body, ...over });

    it.each([
      ['no file', { attachmentIds: [] }],
      ['no list of files', { attachmentIds: undefined }],
      ['eleven files', { attachmentIds: ids(11) }],
      ['the same file twice', { attachmentIds: [...ids(1), ...ids(1)] }],
      ['no amount', { requestedAmount: undefined }],
      ['a note of 1001 characters', { note: 'n'.repeat(1001) }],
      ['lines, which BM-10 no longer has', { lines: [{ description: 'Figma', amount: { amount: '1' } }] }],
    ] as const)('turns away %s with 422', async (_name, over) => {
      const response = await send(over).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it('takes ten files, the amount and a note of 1000 characters: the next error is not a validation one', async () => {
      const response = await send({ attachmentIds: ids(10), note: 'n'.repeat(1000) });

      expect(bodyOf(response).error?.code).not.toBe('VALIDATION_ERROR');
    });
  });
});
