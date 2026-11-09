import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const zbb = { purpose: 'p', alternatives: 'a', consequenceIfNot: 'c', usageIndicator: 'u' };
const line = (extra: Record<string, unknown> = {}) => ({
  description: 'Figma',
  amount: { amount: '1000' },
  lineType: 'RENEW',
  priorityRank: 1,
  ...extra,
});
const without = (key: string) => Object.fromEntries(Object.entries(line()).filter(([name]) => name !== key));

/**
 * The shape of the lines of `BM-10` as the head and Finance send them (QT 4.4, QT 4.5, `QĐ-94l`): the kind and the priority rank are
 * given, the zero-based-budget explanation is four short texts. The rules that read the database (ZBB required, over the ceiling) live in
 * `test/integration/budgets/budget-proposal-lines.integration-spec.ts`.
 */
describe('lines of a budget proposal (HTTP contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const send = (method: 'post' | 'put', path: string, roles: string[], body: object) =>
    request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(roles)))
      .send(body);

  describe.each([
    ['budgetProposalSubmit', '/api/v1/budget-proposals', (lines: object[]) => ({ year: 2027, lines })],
    ['budgetProposalResubmit', `/api/v1/budget-proposals/${ID}/resubmission`, (lines: object[]) => ({ lines })],
  ] as const)('%s', (_operation, path, body) => {
    it.each([
      ['BR-MF4-02: a line without its kind', [without('lineType')]],
      ['a line of a kind that does not exist', [line({ lineType: 'RENEWAL' })]],
      ['QT 4.5: a line without its priority rank', [without('priorityRank')]],
      ['a priority rank of zero', [line({ priorityRank: 0 })]],
      ['a priority rank that is not a whole number', [line({ priorityRank: 1.5 })]],
      ['a zero-based-budget explanation of 1001 characters', [line({ zbb: { ...zbb, purpose: 'x'.repeat(1001) } })]],
      ['a zero-based-budget answer left empty', [line({ zbb: { ...zbb, alternatives: '  ' } })]],
      ['a zero-based-budget explanation with a question missing', [line({ zbb: { purpose: 'p' } })]],
      ['a zero-based-budget explanation with a field of its own', [line({ zbb: { ...zbb, extra: 'x' } })]],
      ['an over-ceiling flag the head tries to set', [line({ overCeiling: { amount: '1' } })]],
    ] as const)('turns away %s with 422', async (_name, lines) => {
      const response = await send('post', path, ['MANAGER'], body([...lines])).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it('takes a line of 1000 characters in each answer: the form and the rules agree (the next error is not a validation one)', async () => {
      const full = { purpose: 'x'.repeat(1000), alternatives: 'a', consequenceIfNot: 'c', usageIndicator: 'u' };
      const response = await send('post', path, ['MANAGER'], body([line({ zbb: full })]));

      expect(response.status).not.toBe(422);
    });
  });

  describe('lines Finance adds to a version', () => {
    const path = `/api/v1/budget-versions/${ID}/lines`;

    it('QT 4.5: refuses a line without its kind with 422', async () => {
      const response = await send('post', path, ['FINANCE'], { lines: [without('lineType')] }).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it('does not ask Finance for the rank or the explanation: the next error is not a validation one', async () => {
      const response = await send('post', path, ['FINANCE'], { lines: [without('priorityRank')] });

      expect(response.status).not.toBe(422);
    });
  });

  describe('the edit of a line of a version', () => {
    const path = `/api/v1/budget-versions/${ID}/lines/1`;

    it.each([
      ['a kind that does not exist', { lineType: 'MOVE' }],
      ['an explanation with an answer too long', { zbb: { ...zbb, consequenceIfNot: 'x'.repeat(1001) } }],
      ['a priority rank of zero', { priorityRank: 0 }],
    ] as const)('turns away %s with 422', async (_name, patch) => {
      const response = await send('put', path, ['FINANCE'], patch).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it('takes the explanation away with null and keeps it when it is not sent: the next error is not a validation one', async () => {
      for (const patch of [{ zbb: null }, { lineType: 'CANCEL' }, { priorityRank: null }]) {
        const response = await send('put', path, ['FINANCE'], patch);

        expect(response.status).not.toBe(422);
      }
    });
  });
});
