import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

/**
 * Đợt 1 (FIELD-CHANGES-DOT-1): a field that the contract dropped is refused with 422 VALIDATION_ERROR by the strict body, and a route
 * that was removed answers 404. One valid body per route, then each dropped field sent on top of it.
 */
const ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';

type Call = {
  name: string;
  method: 'post' | 'put';
  path: string;
  role: string;
  body: object;
  dropped: object;
  /** When given, the same body with this instead of `dropped` passes validation: the 422 above is for the field, not for the body. */
  control?: object;
  /**
   * Where Zod puts the issue the dropped field raises: the path of the object that holds an unknown key (`''` for the body itself),
   * or the path of the key whose value is out of range. Defaults to `''`, or to the first key of `dropped` when `control` is given.
   */
  at?: string;
  /** The unknown key, when it is not the first key of `dropped` (a key inside a nested object). */
  field?: string;
};

/** The body with the unknown key `field` taken out of the object at `at`: what the same call sends when the field is not there. */
function without(value: object, at: string, field: string): object {
  const clone = structuredClone(value) as Record<string, unknown>;
  let node: Record<string, unknown> = clone;
  for (const part of at.split('.').filter(Boolean)) node = node[part] as Record<string, unknown>;
  delete node[field];

  return clone;
}

const DROPPED: Call[] = [
  {
    name: 'renewal: termConfirmation (step 6)',
    method: 'post',
    path: '/api/v1/access-requests/renewals',
    role: 'EMPLOYEE',
    body: { assignmentId: ID, extensionMonths: 6, businessReason: 'Work' },
    dropped: { termConfirmation: { reason: 'Long stay' } },
  },
  {
    name: 'provisioningTaskGrant: expectedEndDate (step 6)',
    method: 'post',
    path: '/api/v1/provisioning-tasks',
    role: 'IT_ADMIN',
    body: { requestId: ID },
    dropped: { expectedEndDate: '2027-01-01' },
  },
  {
    name: 'accessRequestSubmit: termMonths (QĐ-104a: an end date, not months)',
    method: 'post',
    path: '/api/v1/access-requests',
    role: 'EMPLOYEE',
    body: { planId: ID, businessReason: 'Work' },
    dropped: { termMonths: 12 },
    control: { expectedEndDate: '2027-01-01' },
    at: '',
    field: 'termMonths',
  },
  {
    name: 'accessRequestPreview: termMonths (QĐ-104a: an end date, not months)',
    method: 'post',
    path: '/api/v1/access-requests/preview',
    role: 'EMPLOYEE',
    body: { planId: ID },
    dropped: { termMonths: 12 },
    control: { expectedEndDate: '2027-01-01' },
    at: '',
    field: 'termMonths',
  },
  {
    name: 'accessRequestPropose: termMonths (QĐ-104a: an end date, not months)',
    method: 'post',
    path: '/api/v1/access-requests/proposals',
    role: 'EMPLOYEE',
    body: {
      softwareName: 'Tool',
      homepageUrl: 'https://example.test',
      purpose: 'Work',
      dataDescription: 'None',
      expectedUsers: 1,
    },
    dropped: { termMonths: 12 },
    control: { expectedEndDate: '2027-01-01' },
    at: '',
    field: 'termMonths',
  },
  {
    name: 'accessRequestDraftSave: termMonths (QĐ-104a: an end date, not months)',
    method: 'post',
    path: '/api/v1/access-requests/drafts',
    role: 'EMPLOYEE',
    body: { kind: 'INDIVIDUAL', planId: ID, businessReason: 'Work' },
    dropped: { termMonths: 12 },
    control: { expectedEndDate: '2027-01-01' },
    at: '',
    field: 'termMonths',
  },
  {
    name: 'groupRequestCheck: termMonths (QĐ-104a: an end date, not months)',
    method: 'post',
    path: '/api/v1/group-requests/check',
    role: 'EMPLOYEE',
    body: { planId: ID, businessReason: 'Work', lines: [{ employeeId: ID }] },
    dropped: { termMonths: 12 },
    control: { expectedEndDate: '2027-01-01' },
    at: '',
    field: 'termMonths',
  },
  {
    name: 'accessRequestServiceAccountSubmit: termMonths (QĐ-104a: an end date, not months)',
    method: 'post',
    path: '/api/v1/access-requests/service-accounts',
    role: 'EMPLOYEE',
    body: { planId: ID, businessReason: 'Work', purpose: 'Build', expectedIdentifier: 'ci-bot' },
    dropped: { termMonths: 12 },
  },
  {
    name: 'groupRequestSubmit: termMonths (QĐ-104a: an end date, not months)',
    method: 'post',
    path: '/api/v1/group-requests',
    role: 'EMPLOYEE',
    body: { planId: ID, businessReason: 'Work', lines: [{ employeeId: ID }] },
    dropped: { termMonths: 12 },
    control: { expectedEndDate: '2027-01-01' },
    at: '',
    field: 'termMonths',
  },
  {
    name: 'groupRequestSubmit: termConfirmation (step 7)',
    method: 'post',
    path: '/api/v1/group-requests',
    role: 'EMPLOYEE',
    body: { planId: ID, businessReason: 'Work', lines: [{ employeeId: ID }] },
    dropped: { termConfirmation: { reason: 'Long' } },
  },
  {
    name: 'accessRequestNeedDecide: termConfirmation (step 7)',
    method: 'post',
    path: `/api/v1/access-requests/${ID}/need-decision`,
    role: 'MANAGER',
    body: { decision: 'APPROVE' },
    dropped: { termConfirmation: { reason: 'Long' } },
  },
  {
    name: 'accessRequestLineNeedDecide: termConfirmation (step 7)',
    method: 'post',
    path: `/api/v1/access-requests/${ID}/line-need-decisions`,
    role: 'MANAGER',
    body: { lines: [{ employeeId: ID, decision: 'APPROVE' }] },
    dropped: { termConfirmation: { reason: 'Long' } },
  },
  ...[
    ['accessRequestSubmit', '/api/v1/access-requests', { planId: ID, businessReason: 'Work' }],
    ['accessRequestPreview', '/api/v1/access-requests/preview', { planId: ID }],
    [
      'accessRequestServiceAccountSubmit',
      '/api/v1/access-requests/service-accounts',
      { planId: ID, businessReason: 'Work', purpose: 'Build', expectedIdentifier: 'ci-bot' },
    ],
    [
      'accessRequestPropose',
      '/api/v1/access-requests/proposals',
      {
        softwareName: 'Tool',
        homepageUrl: 'https://example.test',
        purpose: 'Work',
        dataDescription: 'None',
        expectedUsers: 1,
      },
    ],
    [
      'groupRequestSubmit',
      '/api/v1/group-requests',
      { planId: ID, businessReason: 'Work', lines: [{ employeeId: ID }] },
    ],
    [
      'accessRequestRenewalSubmit',
      '/api/v1/access-requests/renewals',
      { assignmentId: ID, extensionMonths: 6, businessReason: 'Work' },
    ],
  ].map(([name, path, body]) => ({
    name: `${name as string}: expectedSpendOn (step 8)`,
    method: 'post' as const,
    path: path as string,
    role: 'EMPLOYEE',
    body: body as object,
    dropped: { expectedSpendOn: '2027-01-01' },
  })),
  {
    name: 'accessRequestSupplementAdd: expectedSpendOn (step 8)',
    method: 'post',
    path: `/api/v1/access-requests/${ID}/supplements`,
    role: 'MANAGER',
    body: { dropEmployeeIds: [ID], reason: 'x' },
    dropped: { expectedSpendOn: '2027-01-01' },
  },
  {
    name: 'accessRequestNeedDecide: spend.expectedSpendOn (step 8)',
    method: 'post',
    path: `/api/v1/access-requests/${ID}/need-decision`,
    role: 'MANAGER',
    body: { decision: 'APPROVE' },
    dropped: { spend: { offPlan: true, expectedSpendOn: '2027-01-01' } },
  },
  {
    name: 'spendApprovalDecide: override (step 9)',
    method: 'post',
    path: `/api/v1/access-requests/${ID}/spend-approval`,
    role: 'SPENDING_APPROVER',
    body: { decision: 'APPROVE' },
    dropped: { override: { reason: 'x', years: [2026] } },
  },
  {
    name: 'spendApprovalLineDecide: override (step 9)',
    method: 'post',
    path: `/api/v1/access-requests/${ID}/line-spend-decisions`,
    role: 'SPENDING_APPROVER',
    body: { lines: [{ employeeId: ID, decision: 'APPROVE' }] },
    dropped: { override: { reason: 'x', years: [2026] } },
  },
  ...['highValuePercent', 'highValueAmount'].map((field) => ({
    name: `budgetVersionCreate: ${field} (step 10)`,
    method: 'post' as const,
    path: '/api/v1/budget-versions',
    role: 'FINANCE',
    body: { proposalId: ID, base: { amount: '100' }, reserve: { amount: '10' } },
    dropped: { [field]: field === 'highValuePercent' ? 10 : { amount: '1' } },
  })),
  ...['highValuePercent', 'highValueAmount', 'reason'].map((field) => ({
    name: `budgetVersionUpdate: ${field} (step 10)`,
    method: 'put' as const,
    path: `/api/v1/budget-versions/${ID}`,
    role: 'FINANCE',
    body: { quarters: null },
    dropped: {
      [field]: field === 'highValuePercent' ? 10 : field === 'reason' ? 'x' : { amount: '1' },
    },
  })),
  // `costCenterId` of the proposal is no longer dropped: a head who answers for two departments names the one (QĐ-106k, BUDGET.COST_CENTER_REQUIRED).
  {
    name: 'budgetProposalSubmit: lines[].amount.currency (step 11)',
    method: 'post',
    path: '/api/v1/budget-proposals',
    role: 'MANAGER',
    body: { year: 2027 },
    dropped: { lines: [{ description: 'Tool', amount: { amount: '100', currency: 'VND' } }] },
    at: 'lines.0.amount',
    field: 'currency',
  },
  {
    name: 'budgetProposalResubmit: lines[].amount.currency (step 11)',
    method: 'post',
    path: `/api/v1/budget-proposals/${ID}/resubmission`,
    role: 'MANAGER',
    body: {},
    dropped: { lines: [{ description: 'Tool', amount: { amount: '100', currency: 'VND' } }] },
    at: 'lines.0.amount',
    field: 'currency',
  },
  {
    name: 'budgetVersionCreate: base.currency (step 11)',
    method: 'post',
    path: '/api/v1/budget-versions',
    role: 'FINANCE',
    body: { proposalId: ID },
    dropped: { base: { amount: '100', currency: 'VND' } },
    at: 'base',
    field: 'currency',
  },
  {
    name: 'budgetVersionCreate: reserve.currency (step 11)',
    method: 'post',
    path: '/api/v1/budget-versions',
    role: 'FINANCE',
    body: { proposalId: ID, base: { amount: '100' } },
    dropped: { reserve: { amount: '10', currency: 'VND' } },
    at: 'reserve',
    field: 'currency',
  },
  {
    name: 'budgetVersionUpdate: base.currency (step 11)',
    method: 'put',
    path: `/api/v1/budget-versions/${ID}`,
    role: 'FINANCE',
    body: {},
    dropped: { base: { amount: '100', currency: 'VND' } },
    at: 'base',
    field: 'currency',
  },
  {
    name: 'budgetVersionLineAdd: amount.currency (step 11)',
    method: 'post',
    path: `/api/v1/budget-versions/${ID}/lines`,
    role: 'FINANCE',
    body: {},
    dropped: { lines: [{ description: 'Tool', amount: { amount: '100', currency: 'VND' } }] },
    at: 'lines.0.amount',
    field: 'currency',
  },
  {
    name: 'budgetVersionLineUpdate: amount.currency (step 11)',
    method: 'put',
    path: `/api/v1/budget-versions/${ID}/lines/1`,
    role: 'FINANCE',
    body: {},
    dropped: { amount: { amount: '100', currency: 'VND' } },
    at: 'amount',
    field: 'currency',
  },
  ...['/api/v1/budget-proposals/attachments', `/api/v1/budget-versions/${ID}/attachments`].map((path) => ({
    name: `${path.includes('versions') ? 'budgetVersionAttachmentDeclare' : 'budgetProposalAttachmentDeclare'}: sizeBytes 0 (step 11)`,
    method: 'post' as const,
    path,
    role: path.includes('versions') ? 'FINANCE' : 'MANAGER',
    body: { fileName: 'a.pdf', contentType: 'application/pdf' },
    dropped: { sizeBytes: 0 },
    control: { sizeBytes: 1000 },
  })),
  {
    name: 'accessRequestRenewalSubmit: newExpectedEndDate (step 12)',
    method: 'post',
    path: '/api/v1/access-requests/renewals',
    role: 'EMPLOYEE',
    body: { assignmentId: ID, extensionMonths: 6, businessReason: 'Work' },
    dropped: { newExpectedEndDate: '2027-01-01' },
  },
  {
    name: 'accessRequestRenewalSubmit: extensionMonths 13 (step 12)',
    method: 'post',
    path: '/api/v1/access-requests/renewals',
    role: 'EMPLOYEE',
    body: { assignmentId: ID, businessReason: 'Work' },
    dropped: { extensionMonths: 13 },
    control: { extensionMonths: 12 },
  },
  ...['/api/v1/group-requests', '/api/v1/group-requests/check'].map((path) => ({
    name: `${path.endsWith('check') ? 'groupRequestCheck' : 'groupRequestSubmit'}: lines[].expectedEndDate (step 12)`,
    method: 'post' as const,
    path,
    role: 'EMPLOYEE',
    body: { planId: ID, businessReason: 'Work' },
    dropped: { lines: [{ employeeId: ID, expectedEndDate: '2027-01-01' }] },
    at: 'lines.0',
    field: 'expectedEndDate',
  })),
  ...['/api/v1/budget-proposals', `/api/v1/budget-proposals/${ID}/resubmission`].flatMap((path) =>
    ['windowFrom', 'windowTo', 'servicePeriodMonths', 'repeatCycle', 'quoteValidUntil'].map((field) => ({
      name: `${path.includes('resubmission') ? 'budgetProposalResubmit' : 'budgetProposalSubmit'}: lines[].${field} (step 12b)`,
      method: 'post' as const,
      path,
      role: 'MANAGER',
      body: path.includes('resubmission') ? {} : { year: 2027 },
      dropped: {
        lines: [
          {
            description: 'Tool',
            amount: { amount: '100' },
            [field]: field === 'servicePeriodMonths' ? 12 : field === 'repeatCycle' ? 'ANNUAL' : '2027-01-01',
          },
        ],
      },
      at: 'lines.0',
      field,
    })),
  ),
  ...['windowFrom', 'windowTo', 'servicePeriodMonths', 'repeatCycle', 'quoteValidUntil'].map((field) => ({
    name: `budgetVersionLineUpdate: ${field} (step 12b)`,
    method: 'put' as const,
    path: `/api/v1/budget-versions/${ID}/lines/1`,
    role: 'FINANCE',
    body: { financeComment: 'Checked' },
    dropped: { [field]: field === 'servicePeriodMonths' ? 12 : field === 'repeatCycle' ? 'ANNUAL' : '2027-01-01' },
  })),
  {
    name: 'budgetVersionLineAdd: lines[].windowFrom (step 12b)',
    method: 'post',
    path: `/api/v1/budget-versions/${ID}/lines`,
    role: 'FINANCE',
    body: {},
    dropped: { lines: [{ description: 'Tool', amount: { amount: '100' }, windowFrom: '2027-01-01' }] },
    at: 'lines.0',
    field: 'windowFrom',
  },
  {
    name: 'budgetProposalSubmit: a line with neither plan nor description (step 12b)',
    method: 'post',
    path: '/api/v1/budget-proposals',
    role: 'MANAGER',
    body: { year: 2027 },
    dropped: { lines: [{ amount: { amount: '100' } }] },
    control: { lines: [{ description: 'Tool', amount: { amount: '100' } }] },
    at: 'lines.0.description',
  },
  {
    name: 'accessRequestNeedDecide: spend.planLine (step 12b)',
    method: 'post',
    path: `/api/v1/access-requests/${ID}/need-decision`,
    role: 'MANAGER',
    body: { decision: 'APPROVE' },
    dropped: { spend: { planLine: { position: 1 } } },
  },
  {
    name: 'accessRequestNeedDecide: spend.offPlan (step 12b)',
    method: 'post',
    path: `/api/v1/access-requests/${ID}/need-decision`,
    role: 'MANAGER',
    body: { decision: 'APPROVE' },
    dropped: { spend: { offPlan: true } },
  },
  {
    name: 'accessRequestLineNeedDecide: spend (step 12b)',
    method: 'post',
    path: `/api/v1/access-requests/${ID}/line-need-decisions`,
    role: 'MANAGER',
    body: { lines: [{ employeeId: ID, decision: 'APPROVE' }] },
    dropped: { spend: { offPlan: true } },
  },
];

const REMOVED_ROUTES: Array<[string, 'post' | 'put' | 'get', string, string]> = [
  ['delegatedRequestSend (step 6)', 'post', '/api/v1/delegated-requests', 'MANAGER'],
  ['accessRequestPlanLineSet (step 12b)', 'put', `/api/v1/access-requests/${ID}/plan-line`, 'MANAGER'],
  [
    'accessRequestPlanLineSuggestionList (step 12b)',
    'get',
    `/api/v1/access-requests/${ID}/plan-line-suggestions`,
    'MANAGER',
  ],
  ['budgetVersionRevise (step 10)', 'post', '/api/v1/budget-versions/revisions', 'FINANCE'],
  ['budgetVersionLineWindow (step 10)', 'put', `/api/v1/budget-versions/${ID}/lines/1/window`, 'FINANCE'],
  ['budgetVersionLineChangeList (step 10)', 'get', `/api/v1/budget-versions/${ID}/lines/1/changes`, 'FINANCE'],
];

const STATE_FILTER = '/api/v1/budget-versions?state=SUPERSEDED';

describe('Đợt 1: fields the contract dropped and routes it removed', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createHttpContractApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  const sendOf = (call: Call): object => ({ ...call.body, ...call.dropped });
  const validBodyOf = (call: Call): object =>
    call.control !== undefined
      ? { ...call.body, ...call.control }
      : without(sendOf(call), call.at ?? '', call.field ?? Object.keys(call.dropped)[0]);
  const issuePathOf = (call: Call): string =>
    call.at ?? (call.control !== undefined ? Object.keys(call.dropped)[0] : '');

  it.each(DROPPED)(
    'does not refuse the body of $name once the dropped field is out or in range: the 422 below is for that field',
    async (call) => {
      const response = await request(app.getHttpServer())
        [call.method](call.path)
        .set('Authorization', bearer(principal([call.role])))
        .send(validBodyOf(call));

      expect(bodyOf(response).error?.code).not.toBe('VALIDATION_ERROR');
    },
  );

  it.each(DROPPED)('refuses $name with 422 VALIDATION_ERROR, on the dropped field', async (call) => {
    const response = await request(app.getHttpServer())
      [call.method](call.path)
      .set('Authorization', bearer(principal([call.role])))
      .send(sendOf(call));

    expect([response.status, bodyOf(response).error?.code]).toEqual([422, 'VALIDATION_ERROR']);
    const issues = (bodyOf(response).error?.details as { issues: Array<{ path: string }> }).issues;
    expect(issues.map((issue) => issue.path)).toContain(issuePathOf(call));
  });

  it.each(REMOVED_ROUTES)('answers 404 on the removed route %s', async (_name, method, path, role) => {
    const response = await request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal([role])))
      .send({});

    expect(response.status).toBe(404);
  });

  it('refuses the state filter SUPERSEDED on the list of versions (step 10)', async () => {
    const response = await request(app.getHttpServer())
      .get(STATE_FILTER)
      .set('Authorization', bearer(principal(['FINANCE'])));

    expect([response.status, bodyOf(response).error?.code]).toEqual([422, 'VALIDATION_ERROR']);
  });
});
