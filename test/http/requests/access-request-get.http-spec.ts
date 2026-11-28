import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AccessRequestQueryService } from '../../../src/modules/requests/request-view/access-request-query.service';
import { SpendApprovalViewService } from '../../../src/modules/requests/spend-approval-view/spend-approval-view.service';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const REQ_ID = '11111111-1111-4111-8111-111111111111';
const EMP_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const DEPT_ID = '44444444-4444-4444-8444-444444444444';
const CC_ID = '55555555-5555-4555-8555-555555555555';
const STEP_ID = '66666666-6666-4666-8666-666666666666';
const TS = new Date('2026-11-21T00:00:00.000Z');

const empRef = { employeeId: EMP_ID, employeeCode: 'EMP-01', fullName: 'Nguyen Van A' };

const baseRequestView = (over: Record<string, unknown> = {}) => ({
  id: REQ_ID,
  type: 'GRANT',
  branch: 'PAID_IN_CATALOG',
  state: 'AWAITING_SPEND_DECISION',
  routing: { mode: 'VIA_HEAD', oneStepReason: null },
  plan: { planId: PLAN_ID, planName: 'Standard', applicationId: DEPT_ID, applicationName: 'Lan' },
  proposal: null,
  department: { id: DEPT_ID, code: 'ENG', name: 'Engineering' },
  costCenter: { id: CC_ID, code: 'CC-ENG' },
  requester: empRef,
  beneficiary: empRef,
  lineCount: 1,
  businessReason: 'Need license',
  termMonths: 12,
  expectedEndDate: null,
  spend: null,
  budgetYear: 2026,
  pricing: {
    status: 'PRICED',
    missingReason: null,
    amount: { amount: '1000000', currency: 'VND' },
    unitPrice: { amount: '500000', currency: 'VND' },
    billingCycle: 'ANNUAL',
    kind: 'RECURRING',
    months: 2,
    monthlyPrice: { amount: '500000', currency: 'VND' },
    nextYearAmount: null,
  },
  cost: null,
  policy: { version: 1, hasSpendStep: true, slaWorkingDays: 3 },
  submittedAt: TS,
  ticketRef: null,
  latestReply: null,
  withdrawal: null,
  cancellation: null,
  serviceAccount: null,
  limitExemption: null,
  renewal: null,
  needStep: {
    id: STEP_ID,
    state: 'APPROVED',
    routingRow: 1,
    waitingReason: null,
    slaWorkingDays: 3,
    createdAt: TS,
    assignedAt: TS,
    decidedAt: TS,
    assignee: empRef,
  },
  needDecision: null,
  ...over,
});

const baseApprovalDetail = (over: Record<string, unknown> = {}) => ({
  routing: { mode: 'VIA_HEAD', oneStepReason: null },
  requestId: REQ_ID,
  step: {
    id: STEP_ID,
    state: 'PENDING',
    waitingReason: null,
    assignee: empRef,
    openedAt: TS.toISOString(),
    decidedAt: null,
    slaWorkingDays: 3,
  },
  request: {
    state: 'AWAITING_SPEND_DECISION',
    plan: { planId: PLAN_ID, planName: 'Standard', applicationName: 'Lan' },
    softwareName: null,
    requester: empRef,
    beneficiary: empRef,
    lineCount: 1,
    costCenter: { id: CC_ID, code: 'CC-ENG' },
    businessReason: 'Need license',
    termMonths: 12,
    expectedEndDate: null,
    budgetYear: 2026,
  },
  need: null,
  cost: null,
  termCost: null,
  assessment: null,
  decision: null,
  budgetSnapshot: null,
  nextYearBudget: null,
  annualVendorAmount: null,
  ...over,
});

describe('accessRequestGet & spendApprovalGet vendorChargeUntilRenewal (http contract, W3-20)', () => {
  let app: INestApplication<App>;
  const auth = bearer(principal(['SPENDING_APPROVER'], { employeeId: EMP_ID }));
  const requestQueries = { get: jest.fn() };
  const spendViews = { detail: jest.fn() };

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: AccessRequestQueryService, useValue: requestQueries },
        { token: SpendApprovalViewService, useValue: spendViews },
      ],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('includes vendorChargeUntilRenewal when present and omits it when absent on accessRequestGet', async () => {
    requestQueries.get.mockResolvedValueOnce(
      baseRequestView({
        vendorChargeUntilRenewal: {
          until: '2027-07-01',
          amount: { amount: '55000000', currency: 'VND' },
          mode: 'ONE_OFF',
          tierStepSeats: 50,
        },
      }),
    );

    const withCharge = await request(app.getHttpServer())
      .get(`/api/v1/access-requests/${REQ_ID}`)
      .set('Authorization', auth)
      .expect(200);

    expect(
      (withCharge.body as { data: { request: Record<string, unknown> } }).data.request.vendorChargeUntilRenewal,
    ).toEqual({
      until: '2027-07-01',
      amount: { amount: '55000000', currency: 'VND' },
      mode: 'ONE_OFF',
      tierStepSeats: 50,
    });

    requestQueries.get.mockResolvedValueOnce(baseRequestView());
    const withoutCharge = await request(app.getHttpServer())
      .get(`/api/v1/access-requests/${REQ_ID}`)
      .set('Authorization', auth)
      .expect(200);
    expect('vendorChargeUntilRenewal' in (withoutCharge.body as { data: { request: object } }).data.request).toBe(
      false,
    );
  });

  it('includes vendorChargeUntilRenewal when present and omits it when absent on spendApprovalGet', async () => {
    spendViews.detail.mockResolvedValueOnce(
      baseApprovalDetail({
        vendorChargeUntilRenewal: {
          until: '2026-12-01',
          amount: { amount: '166667', currency: 'VND' },
          mode: 'MONTHLY',
        },
      }),
    );

    const withCharge = await request(app.getHttpServer())
      .get(`/api/v1/access-requests/${REQ_ID}/spend-approval`)
      .set('Authorization', auth)
      .expect(200);

    expect(
      (withCharge.body as { data: { spendApproval: Record<string, unknown> } }).data.spendApproval
        .vendorChargeUntilRenewal,
    ).toEqual({
      until: '2026-12-01',
      amount: { amount: '166667', currency: 'VND' },
      mode: 'MONTHLY',
    });

    spendViews.detail.mockResolvedValueOnce(baseApprovalDetail());
    const withoutCharge = await request(app.getHttpServer())
      .get(`/api/v1/access-requests/${REQ_ID}/spend-approval`)
      .set('Authorization', auth)
      .expect(200);
    expect(
      'vendorChargeUntilRenewal' in (withoutCharge.body as { data: { spendApproval: object } }).data.spendApproval,
    ).toBe(false);
  });

  it('includes ticketRef: null and latestReply: null for standalone requests on accessRequestGet', async () => {
    requestQueries.get.mockResolvedValueOnce(baseRequestView());

    const response = await request(app.getHttpServer())
      .get(`/api/v1/access-requests/${REQ_ID}`)
      .set('Authorization', auth)
      .expect(200);

    const wire = (response.body as { data: { request: Record<string, unknown> } }).data.request;
    expect(wire.ticketRef).toBeNull();
    expect(wire.latestReply).toBeNull();
  });

  it('includes ticketRef and serialized latestReply when present on accessRequestGet', async () => {
    const ticketRef = { id: '77777777-7777-4777-8777-777777777777', position: 2, itemCount: 3 };
    requestQueries.get.mockResolvedValueOnce(
      baseRequestView({
        ticketRef,
        latestReply: {
          kind: 'REQUESTER_RESUBMISSION',
          note: 'dùng cho dự án X, 3 tháng',
          author: { id: EMP_ID, name: 'Nguyen Van A' },
          createdAt: TS,
        },
      }),
    );

    const response = await request(app.getHttpServer())
      .get(`/api/v1/access-requests/${REQ_ID}`)
      .set('Authorization', auth)
      .expect(200);

    const wire = (response.body as { data: { request: Record<string, unknown> } }).data.request;
    expect(wire.ticketRef).toEqual(ticketRef);
    expect(wire.latestReply).toEqual({
      kind: 'REQUESTER_RESUBMISSION',
      note: 'dùng cho dự án X, 3 tháng',
      author: { id: EMP_ID, name: 'Nguyen Van A' },
      createdAt: TS.toISOString(),
    });
  });
});
