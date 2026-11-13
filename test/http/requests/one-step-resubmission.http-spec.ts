import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { RequestResubmissionService } from '../../../src/modules/requests/request-intake/request-resubmission.service';
import {
  AccessRequestNotAwaitingRevisionError,
  AccessRequestNotRequesterError,
} from '../../../src/modules/requests/access-request/access-request.errors';
import { AccessRequestQueryService } from '../../../src/modules/requests/request-view/access-request-query.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';
const PATH = `/api/v1/access-requests/${ID}/resubmission`;
const person = { employeeId: ID, employeeCode: 'E1', fullName: 'Requester' };
const date = new Date('2026-11-09T00:00:00Z');
const view = {
  id: ID,
  type: 'GRANT',
  branch: 'PAID_IN_CATALOG',
  state: 'AWAITING_REQUESTER_REVISION',
  routing: { mode: 'ONE_STEP', oneStepReason: 'REQUESTER_IS_HEAD' },
  plan: null,
  proposal: null,
  department: { id: ID, code: 'D1', name: 'Design' },
  costCenter: { id: ID, code: 'CC1' },
  requester: person,
  beneficiary: person,
  lineCount: 1,
  businessReason: 'Work',
  termMonths: null,
  expectedEndDate: null,
  serviceAccount: null,
  renewal: null,
  flags: { manyPaidSoftware: null },
  limitExemption: null,
  spend: { stage: 'RETURNED_TO_REQUESTER', blockedReasons: ['PRICE_MISSING'], overBy: null, refusalReason: null },
  budgetYear: 2026,
  pricing: {
    status: 'MISSING',
    missingReason: 'NO_PRICED_SUBSCRIPTION',
    amount: null,
    unitPrice: null,
    billingCycle: null,
    kind: null,
    months: null,
    monthlyPrice: null,
    nextYearAmount: null,
  },
  policy: { version: 2, hasSpendStep: true, slaWorkingDays: 2 },
  submittedAt: date,
  needStep: {
    id: ID,
    state: 'NOT_REQUIRED',
    assignee: null,
    routingRow: 4,
    waitingReason: null,
    slaWorkingDays: null,
    createdAt: date,
    assignedAt: null,
    decidedAt: null,
  },
  needDecision: null,
  withdrawal: null,
  cancellation: null,
};
describe('BR-MF1-02: one-step resubmission HTTP contract', () => {
  let app: INestApplication<App>;
  const resubmit = jest.fn();
  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: RequestResubmissionService, useValue: { resubmit } },
        { token: AccessRequestQueryService, useValue: { view: jest.fn().mockResolvedValue(view) } },
      ],
    });
  });
  beforeEach(() => {
    resubmit.mockReset();
    resubmit.mockResolvedValue({ id: ID });
  });
  afterAll(async () => app?.close());
  const call = () =>
    request(app.getHttpServer())
      .post(PATH)
      .set('Authorization', bearer(principal(['EMPLOYEE'])));
  it('needs authentication', async () => {
    await request(app.getHttpServer()).post(PATH).expect(401);
    expect(resubmit).not.toHaveBeenCalled();
  });
  it('returns 200 with routing, revision reasons and no need SLA or retired flag', async () => {
    const response = await call().expect(200);
    expect(bodyOf(response).message).toBe('ACCESS_REQUEST.RESUBMITTED');
    expect((bodyOf(response).data as unknown as { request: typeof view }).request).toMatchObject({
      routing: view.routing,
      needStep: { state: 'NOT_REQUIRED', slaWorkingDays: null },
      spend: { blockedReasons: ['PRICE_MISSING'] },
    });
    expect((bodyOf(response).data as unknown as { request: typeof view }).request.needStep).not.toHaveProperty(
      'samePersonAsSpend',
    );
  });
  it.each([
    [new AccessRequestNotRequesterError(), 403, 'ACCESS_REQUEST.NOT_REQUESTER'],
    [new AccessRequestNotAwaitingRevisionError(), 409, 'ACCESS_REQUEST.NOT_AWAITING_REVISION'],
  ])('maps requester/state refusal', async (error, status, code) => {
    resubmit.mockRejectedValue(error);
    expect(bodyOf(await call().expect(status)).error.code).toBe(code);
  });
  it('validates the path before calling the service', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/access-requests/no-id/resubmission')
      .set('Authorization', bearer(principal(['EMPLOYEE'])))
      .expect(422);
    expect(resubmit).not.toHaveBeenCalled();
  });
});
