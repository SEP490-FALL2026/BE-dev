import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AssessmentCompletionService } from '../../../src/modules/requests/assessment/assessment-completion.service';
import { AssessmentRejectionService } from '../../../src/modules/requests/assessment/assessment-rejection.service';
import { AssessmentReturnService } from '../../../src/modules/requests/assessment-decision/assessment-return.service';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { bodyOf } from '../../support/api-body';
const ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';
const CHECKLIST = { policyVersionId: ID, answers: [{ itemCode: '1.3-03', answer: 'YES' }] };
describe('BR-MF1-04: an uncontrollable tool needs an alternative', () => {
  let app: INestApplication<App>;
  const reject = jest.fn().mockRejectedValue(new Error('handler reached'));
  const send = jest.fn().mockRejectedValue(new Error('handler reached'));
  const complete = jest.fn().mockRejectedValue(new Error('handler reached'));
  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: AssessmentRejectionService, useValue: { reject } },
        { token: AssessmentReturnService, useValue: { send } },
        { token: AssessmentCompletionService, useValue: { complete } },
      ],
    });
  });
  afterAll(async () => app?.close());
  beforeEach(() => jest.clearAllMocks());
  const post = (body: object, route = 'rejection') =>
    request(app.getHttpServer())
      .post(`/api/v1/access-requests/${ID}/assessment/${route}`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(body);
  it('returns 422 before the service when UNCONTROLLABLE has no alternative', async () => {
    const response = await post({
      decision: 'REJECT',
      kind: 'UNCONTROLLABLE',
      reason: 'Cannot revoke access',
      checklist: CHECKLIST,
    }).expect(422);
    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(reject).not.toHaveBeenCalled();
  });
  it.each([
    { kind: 'UNCONTROLLABLE', alternativeNote: 'Use approved portal' },
    { kind: 'UNCONTROLLABLE', alternativePlanId: ID },
    { kind: 'NOT_ELIGIBLE' },
  ])('accepts the alternative or NOT_ELIGIBLE without one', async (body) => {
    const response = await post({ decision: 'REJECT', reason: 'Cannot use this tool', checklist: CHECKLIST, ...body });
    expect(bodyOf(response).error?.code).not.toBe('VALIDATION_ERROR');
    expect(reject).toHaveBeenCalledTimes(1);
  });
  it('PL-2.4: asks for the checklist and the word of the decision of every refusal and return', async () => {
    const noChecklist = await post({ decision: 'REJECT', kind: 'NOT_ELIGIBLE', reason: 'No' }).expect(422);
    const noDecision = await post({ kind: 'NOT_ELIGIBLE', reason: 'No', checklist: CHECKLIST }).expect(422);
    const noKind = await post({ decision: 'REJECT', reason: 'No', checklist: CHECKLIST }).expect(422);

    for (const response of [noChecklist, noDecision, noKind]) {
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
    expect(reject).not.toHaveBeenCalled();
  });
  it('PL-2.4: sends the proposal back with no kind and no alternative, the reason being typed or left to the checklist', async () => {
    const typed = await post({ decision: 'RETURN', reason: 'Name the vendor', checklist: CHECKLIST });
    const filled = await post({ decision: 'RETURN', checklist: CHECKLIST });
    const withKind = await post({ decision: 'RETURN', kind: 'NOT_ELIGIBLE', checklist: CHECKLIST }).expect(422);

    expect(bodyOf(typed).error?.code).not.toBe('VALIDATION_ERROR');
    expect(bodyOf(filled).error?.code).not.toBe('VALIDATION_ERROR');
    expect(bodyOf(withKind).error.code).toBe('VALIDATION_ERROR');
    expect(send).toHaveBeenCalledTimes(2);
    expect(reject).not.toHaveBeenCalled();
  });
  it('PL-2.4: asks for the checklist to complete the assessment', async () => {
    const bare = await post({}, 'completion').expect(422);
    const extra = await post({ checklist: CHECKLIST, force: true }, 'completion').expect(422);
    const answered = await post({ checklist: CHECKLIST }, 'completion');

    expect(bodyOf(bare).error.code).toBe('VALIDATION_ERROR');
    expect(bodyOf(extra).error.code).toBe('VALIDATION_ERROR');
    expect(bodyOf(answered).error?.code).not.toBe('VALIDATION_ERROR');
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it.each([
    [`/api/v1/access-requests/${ID}/internal-registration`, { businessOwnerEmployeeId: ID }],
    [`/api/v1/access-requests/${ID}/assessment`, { proposedBusinessOwnerEmployeeId: ID }],
  ])('P2-05: refuses retired owner input at %s', async (path, body) => {
    const method = path.endsWith('/assessment') ? 'put' : 'post';
    const response = await request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(body)
      .expect(422);
    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
