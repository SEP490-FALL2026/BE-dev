import {
  newRequestOf,
  routedAuditDetail,
  submittedAuditDetail,
  type SubmittedRequest,
} from './access-request-submission.mapper';

const base = (decision: unknown, extra: Partial<SubmittedRequest> = {}): SubmittedRequest => ({
  actor: { employeeId: 'emp-1', appUserId: 'user-1' },
  organizationId: 'org-1',
  body: { planId: 'plan-1', termMonths: 6, businessReason: 'Cần cho dự án' },
  assessed: {
    unit: { departmentId: 'dep-1', costCenter: { id: 'cc-1' } },
    policy: { branch: 'PAID_IN_CATALOG', version: 3, slaWorkingDays: 2, chain: ['NEED', 'SPEND_APPROVAL'] },
    pricing: {
      status: 'COMPUTED',
      amount: { amountMinor: 1200n, currency: 'VND' },
      budgetYear: 2026,
      expectedSpendOn: '2026-11-01',
    },
    routing: { decision, departmentHeadEmployeeId: 'head-1' },
  } as unknown as SubmittedRequest['assessed'],
  now: new Date('2026-10-30T03:00:00Z'),
  ...extra,
});

const assigned = {
  outcome: 'ASSIGNED',
  row: 1,
  role: 'MANAGER',
  assigneeEmployeeId: 'head-1',
  samePersonAsSpend: false,
};
const waiting = { outcome: 'WAITING', row: 8, reason: 'NO_VALID_APPROVER' };

describe('the row, and the audit entries, of a request that is sent (US-05-02, US-05-03)', () => {
  it('writes a request for the sender alone, pending with the person the table named', () => {
    const row = newRequestOf(base(assigned));

    expect(row).toMatchObject({
      organizationId: 'org-1',
      branch: 'PAID_IN_CATALOG',
      state: 'PENDING',
      planId: 'plan-1',
      requesterEmployeeId: 'emp-1',
      beneficiaryEmployeeIds: ['emp-1'],
      departmentId: 'dep-1',
      costCenterId: 'cc-1',
      expectedEndDate: null,
      draftId: null,
      createdByAppUserId: 'user-1',
      needStep: {
        state: 'PENDING',
        assigneeEmployeeId: 'head-1',
        routingRow: 1,
        waitingReason: null,
        slaWorkingDays: 2,
      },
    });
  });

  it('leaves the need step waiting under control when nobody valid exists, and keeps the draft; the end is worked out when the request is granted (R-M4)', () => {
    const row = newRequestOf(base(waiting, { draftId: 'draft-1' }));

    expect(row).toMatchObject({
      state: 'WAITING_CONTROLLED',
      draftId: 'draft-1',
      expectedEndDate: null,
      needStep: { state: 'WAITING', assigneeEmployeeId: null, routingRow: 8, waitingReason: 'NO_VALID_APPROVER' },
    });
  });

  it('charges nothing to a free request of a department with no Cost Center', () => {
    const facts = base(assigned);
    (facts.assessed.unit as { costCenter: unknown }).costCenter = null;

    expect(newRequestOf(facts).costCenterId).toBeNull();
    expect(submittedAuditDetail(facts).costCenterId).toBeNull();
  });

  it('says in the first entry what was asked and by what it was judged, the amount as text', () => {
    expect(submittedAuditDetail(base(assigned))).toEqual({
      branch: 'PAID_IN_CATALOG',
      state: 'PENDING',
      planId: 'plan-1',
      termMonths: 6,
      requesterEmployeeId: 'emp-1',
      beneficiaryEmployeeIds: ['emp-1'],
      departmentId: 'dep-1',
      costCenterId: 'cc-1',
      policyVersion: 3,
      hasSpendStep: true,
      slaWorkingDays: 2,
      pricingStatus: 'COMPUTED',
      amountMinor: '1200',
      amountCurrency: 'VND',
      budgetYear: 2026,
      expectedSpendOn: '2026-11-01',
    });
  });

  it('says in the second entry who was named and in which role, or why nobody was', () => {
    expect(routedAuditDetail(base(assigned), 'req-1')).toEqual({
      requestId: 'req-1',
      routingRow: 1,
      outcome: 'ASSIGNED',
      assigneeEmployeeId: 'head-1',
      role: 'MANAGER',
      waitingReason: null,
      samePersonAsSpend: false,
      requesterEmployeeId: 'emp-1',
      departmentId: 'dep-1',
      departmentHeadEmployeeId: 'head-1',
    });
    expect(routedAuditDetail(base(waiting), 'req-1')).toMatchObject({
      outcome: 'WAITING',
      assigneeEmployeeId: null,
      role: null,
      waitingReason: 'NO_VALID_APPROVER',
      samePersonAsSpend: false,
    });
  });
});
