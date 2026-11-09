import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ReserveConfirmationService } from '../../../src/modules/requests/reserve-confirmation/reserve-confirmation.service';
import { SpendBatchService } from '../../../src/modules/requests/spend-submission/spend-batch.service';
import { SpendBatchViewService } from '../../../src/modules/requests/spend-submission/spend-batch-view.service';
import { SpendConfirmationNotInBatchError } from '../../../src/modules/requests/spend/spend.errors';
import { SpendReserveRefusedError } from '../../../src/modules/requests/spend/spend.errors';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';
const OTHER = '9b5e8d2f-3c4a-4d6e-8f70-1b2c3d4e5f60';
const PATH = `/api/v1/access-requests/${ID}/reserve-confirmation`;

/**
 * The contract of the confirmation of the reserve (`BR-MF1-06h`, `P0-04`, `RV-11`): who may call it, what the body is, and what each refusal
 * answers; judged with the services replaced, so nothing here reads a database.
 */
describe('the confirmation of the reserve (http contract, no database)', () => {
  let app: INestApplication<App>;
  const confirm = jest.fn();
  const submit = jest.fn();
  const get = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: ReserveConfirmationService, useValue: { confirm } },
        { token: SpendBatchService, useValue: { submit } },
        { token: SpendBatchViewService, useValue: { get } },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    confirm.mockReset().mockResolvedValue({
      requestId: ID,
      result: 'SPEND_STEP_OPENED',
      budgetOutcome: 'USES_RESERVE',
      blockedReasons: [],
      confirmationKept: true,
    });
    submit.mockReset().mockResolvedValue({ batchId: OTHER, results: [] });
    get.mockReset().mockResolvedValue({
      id: OTHER,
      department: { id: ID, code: 'ENG' },
      submittedBy: { employeeId: ID, employeeCode: 'NV-1', fullName: 'An' },
      submittedAt: '2026-11-09T01:00:00.000Z',
      itemCount: 1,
    });
  });

  const post = (path: string, roles: string[], body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', bearer(principal(roles)))
      .send(body);

  it('BR-MF1-06h: answers 401 without a token', async () => {
    const response = await request(app.getHttpServer()).post(PATH).send({ reason: 'x' }).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('BR-MF1-06h: refuses every role but the head (MANAGER) with 403 and calls nothing', async () => {
    for (const roles of [['EMPLOYEE'], ['IT_ADMIN'], ['FINANCE'], ['SPENDING_APPROVER'], ['SUPER_ADMIN'], []]) {
      const response = await post(PATH, roles, { reason: 'Gấp cho dự án' }).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    ['no reason', {}],
    ['a blank reason', { reason: '   ' }],
    ['a reason of 501 characters', { reason: 'x'.repeat(501) }],
    ['a reason on two lines', { reason: 'dòng một\ndòng hai' }],
    ['a field that is not of the body', { reason: 'ok', requestId: ID }],
  ])('US-06-16 AC-1: turns away %s with 422 and confirms nothing', async (_name, body) => {
    const response = await post(PATH, ['MANAGER'], body).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('US-06-16 AC-1: a reason of 500 characters is taken, trimmed, and the result is given as it is', async () => {
    const response = await post(PATH, ['MANAGER'], { reason: `  ${'x'.repeat(500)}  ` }).expect(200);

    expect(confirm).toHaveBeenCalledWith(expect.anything(), ID, 'x'.repeat(500));
    expect(bodyOf(response).data.reserveConfirmation).toMatchObject({
      result: 'SPEND_STEP_OPENED',
      confirmationKept: true,
    });
  });

  it.each([
    ['SPEND.RESERVE_NOT_PENDING', new SpendReserveRefusedError('RESERVE_NOT_PENDING'), 409],
    ['SPEND.RESERVE_CONFIRMER_IS_BENEFICIARY', new SpendReserveRefusedError('RESERVE_CONFIRMER_IS_BENEFICIARY'), 403],
  ])('answers %s as the refusal it is (%s)', async (code, error, status) => {
    confirm.mockRejectedValue(error);

    const response = await post(PATH, ['MANAGER'], { reason: 'Gấp' }).expect(status);

    expect(bodyOf(response).error.code).toBe(code);
  });

  describe('RV-11: reserveConfirmations in the body of spendBatchSubmit', () => {
    const SUBMIT = '/api/v1/spend-batches';

    it('takes confirmations with a reason of 1 to 500 characters for requests of the batch, and gives results with the batch', async () => {
      submit.mockResolvedValue({
        batchId: OTHER,
        results: [{ requestId: ID, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'APPLIED' }],
      });

      const response = await post(SUBMIT, ['MANAGER'], {
        requestIds: [ID],
        reserveConfirmations: [{ requestId: ID, reason: 'Cần cho đợt phát hành' }],
      }).expect(201);

      expect(submit).toHaveBeenCalledWith(
        expect.anything(),
        [ID],
        [{ requestId: ID, reason: 'Cần cho đợt phát hành' }],
      );
      expect(bodyOf(response).data.results).toEqual([
        { requestId: ID, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'APPLIED' },
      ]);
    });

    it.each([
      ['a confirmation without a reason', { requestIds: [ID], reserveConfirmations: [{ requestId: ID }] }],
      ['a blank reason', { requestIds: [ID], reserveConfirmations: [{ requestId: ID, reason: ' ' }] }],
      [
        'a reason of 501 characters',
        { requestIds: [ID], reserveConfirmations: [{ requestId: ID, reason: 'x'.repeat(501) }] },
      ],
      [
        'a request confirmed twice',
        {
          requestIds: [ID],
          reserveConfirmations: [
            { requestId: ID, reason: 'a' },
            { requestId: ID, reason: 'b' },
          ],
        },
      ],
      ['an override, which no longer exists', { requestIds: [ID], override: { reason: 'x', years: [2026] } }],
    ])('turns away %s with 422', async (_name, body) => {
      const response = await post(SUBMIT, ['MANAGER'], body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(submit).not.toHaveBeenCalled();
    });

    it('answers 422 SPEND_BATCH.CONFIRMATION_NOT_IN_BATCH for a confirmation of a request that is not in the batch', async () => {
      submit.mockRejectedValue(new SpendConfirmationNotInBatchError(OTHER));

      const response = await post(SUBMIT, ['MANAGER'], {
        requestIds: [ID],
        reserveConfirmations: [{ requestId: OTHER, reason: 'Gấp' }],
      }).expect(422);

      expect(bodyOf(response).error).toMatchObject({
        code: 'SPEND_BATCH.CONFIRMATION_NOT_IN_BATCH',
        details: { requestId: OTHER },
      });
    });
  });

  describe('QĐ-97c: what Finance had is gone', () => {
    it.each([
      ['GET', '/api/v1/finance-reviews'],
      ['GET', `/api/v1/access-requests/${ID}/finance-review`],
      ['POST', `/api/v1/access-requests/${ID}/finance-review`],
      ['POST', `/api/v1/access-requests/${ID}/budget-information-requests`],
      ['GET', `/api/v1/access-requests/${ID}/budget-information-requests`],
      ['GET', '/api/v1/budget-information-requests'],
      ['POST', `/api/v1/budget-information-requests/${ID}/answer`],
    ])('%s %s answers 404: the route does not exist', async (method, path) => {
      const call =
        method === 'GET' ? request(app.getHttpServer()).get(path) : request(app.getHttpServer()).post(path).send({});
      const response = await call
        .set('Authorization', bearer(principal(['FINANCE', 'MANAGER', 'SPENDING_APPROVER'])))
        .expect(404);

      expect(response.status).toBe(404);
    });

    it('L2-14 AC-23: a decision with an override in its body is turned away with 422', async () => {
      const response = await post(`/api/v1/access-requests/${ID}/spend-approval`, ['SPENDING_APPROVER'], {
        decision: 'APPROVE',
        override: { reason: 'Cần gấp', years: [2026] },
      }).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
