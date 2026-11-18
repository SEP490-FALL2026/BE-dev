import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DecisionService } from '../../../src/modules/optimization/decision/decision.service';
import {
  PolicyChecklistHasNoError,
  PolicyVersionChangedError,
} from '../../../src/modules/policies/public/policy-checklist.errors';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const PATH = '/api/v1/ghost-seat-decisions';
const CHECKLIST = { policyVersionId: ID, answers: [{ itemCode: '5.4-01', answer: 'YES' }] };
const BODY = { items: [{ recommendationId: ID }], choice: 'KEEP', reason: 'Still needed', checklist: CHECKLIST };

/**
 * `PL-2.6` (`QĐ-111ap`): the decision of the head on a wasted seat takes the checklist of its step, its service replaced: what it refuses before the
 * use case (no checklist, a way to send it back that the step does not have), and how the answers of the checklist reach the caller. What a No
 * does to the choice is proved on PostgreSQL.
 */
describe('ghost seat decision route (no database)', () => {
  let app: INestApplication<App>;
  const decisions = { decide: jest.fn() };
  const post = (body: object, roles: string[] = ['MANAGER']) =>
    request(app.getHttpServer())
      .post(PATH)
      .set('Authorization', bearer(principal(roles)))
      .send(body);

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: DecisionService, useValue: decisions }] });
  });

  beforeEach(() => {
    decisions.decide.mockReset().mockResolvedValue([]);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('hands the checklist to the use case with the choice and the reason', async () => {
    await post(BODY).expect(201);

    expect(decisions.decide).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['MANAGER'] }),
      expect.objectContaining({
        recommendationIds: [ID],
        choice: 'KEEP',
        reason: 'Still needed',
        checklist: CHECKLIST,
      }),
    );
  });

  it('refuses with 422 before the use case a body with no checklist, a malformed one, or a choice to send it back', async () => {
    const withoutChecklist = { items: BODY.items, choice: BODY.choice, reason: BODY.reason };
    const refused = [
      withoutChecklist,
      { ...BODY, checklist: { policyVersionId: 'not-a-uuid', answers: [] } },
      { ...BODY, checklist: { ...CHECKLIST, answers: [{ itemCode: '5.4-01', answer: 'MAYBE' }] } },
      { ...BODY, choice: 'RETURN' },
    ];
    for (const body of refused) {
      const response = await post(body).expect(422);
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
    expect(decisions.decide).not.toHaveBeenCalled();
  });

  it('answers a No that locks keeping with 422 POLICY.CHECKLIST_HAS_NO and the questions, and a version left behind with 409', async () => {
    decisions.decide.mockRejectedValueOnce(
      new PolicyChecklistHasNoError('5.4', [{ code: '5.4-02', text: 'The seat is used by the holder' }]),
    );
    const locked = await post(BODY).expect(422);
    decisions.decide.mockRejectedValueOnce(new PolicyVersionChangedError('5.4', 'v3', 3));
    const stale = await post(BODY).expect(409);

    expect(bodyOf(locked).error.code).toBe('POLICY.CHECKLIST_HAS_NO');
    expect((bodyOf(locked).error.details as unknown as { items: { code: string }[] }).items).toEqual([
      expect.objectContaining({ code: '5.4-02' }),
    ]);
    expect(bodyOf(stale).error.code).toBe('POLICY.VERSION_CHANGED');
  });

  it('is for the head alone', async () => {
    await post(BODY, ['IT_ADMIN']).expect(403);
    expect(decisions.decide).not.toHaveBeenCalled();
  });
});
