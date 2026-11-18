import {
  renewalRequestOf,
  renewalRoutedDetail,
  renewalStateOf,
  renewalSubmittedDetail,
  type RenewalSubmission,
} from './renewal-request-submission.mapper';

const assigned = {
  outcome: 'ASSIGNED',
  row: 1,
  role: 'MANAGER',
  assigneeEmployeeId: 'head-1',
};
const waiting = { outcome: 'WAITING', row: 8, reason: 'NO_VALID_APPROVER' };

const sent = (decision: unknown): RenewalSubmission => ({
  actor: { employeeId: 'actor-1', appUserId: 'user-1' },
  organizationId: 'org-1',
  holder: { employeeId: 'holder-1', planId: 'plan-1' },
  body: { businessReason: 'Gia hạn cho dự án' },
  termMonths: 6,
  newEnd: '2027-06-30',
  now: new Date('2026-10-30T03:00:00Z'),
  assessed: {
    unit: { departmentId: 'dep-1', costCenter: { id: 'cc-1' } },
    policy: {
      branch: 'PAID_IN_CATALOG',
      version: 1,
      slaWorkingDays: 2,
      chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
    },
    pricing: { status: 'COMPUTED' },
    routing: { decision },
  } as unknown as RenewalSubmission['assessed'],
});

describe('the row of a request that asks to renew a right (US-05-14)', () => {
  it('is a request of the kind RENEWAL for the tool and the person who holds it, ending on the day asked for', () => {
    expect(renewalRequestOf(sent(assigned))).toMatchObject({
      type: 'RENEWAL',
      organizationId: 'org-1',
      branch: 'PAID_IN_CATALOG',
      planId: 'plan-1',
      requesterEmployeeId: 'actor-1',
      beneficiaryEmployeeIds: ['holder-1'],
      departmentId: 'dep-1',
      costCenterId: 'cc-1',
      businessReason: 'Gia hạn cho dự án',
      termMonths: 6,
      expectedEndDate: '2027-06-30',
      createdByAppUserId: 'user-1',
    });
  });

  it('leaves the need step to the routing table when the holder asks, pending or waiting under control', () => {
    expect(renewalRequestOf(sent(assigned))).toMatchObject({
      state: 'PENDING',
      needStep: {
        state: 'PENDING',
        assigneeEmployeeId: 'head-1',
        routingRow: 1,
        waitingReason: null,
        slaWorkingDays: 2,
      },
    });
    expect(renewalRequestOf(sent(waiting))).toMatchObject({
      state: 'WAITING_CONTROLLED',
      needStep: {
        state: 'WAITING',
        assigneeEmployeeId: null,
        routingRow: 8,
        waitingReason: 'NO_VALID_APPROVER',
      },
    });
  });

  it('has no project label and no Cost Center when none is given', () => {
    const facts = sent(assigned);
    facts.body = { businessReason: 'x' };
    (facts.assessed.unit as { costCenter: unknown }).costCenter = null;

    expect(renewalRequestOf(facts)).toMatchObject({ costCenterId: null });
    expect(renewalRequestOf(facts)).not.toHaveProperty('projectLabel');
  });

  it('starts pending when the table named somebody, and waits under control otherwise', () => {
    expect(renewalStateOf(true)).toBe('PENDING');
    expect(renewalStateOf(false)).toBe('WAITING_CONTROLLED');
  });
});

describe('the audit entries of a request that asks to renew a right (US-05-14)', () => {
  const seat = { assignmentId: 'asg-1', previousEnd: '2026-12-31', consecutiveMonths: 18 };

  it('says in the first entry what was asked, the seat, the ends, what it was judged by ', () => {
    const facts = sent(assigned);
    facts.assessed = {
      ...facts.assessed,
      pricing: {
        status: 'COMPUTED',
        amount: { amountMinor: 700n, currency: 'VND' },
        budgetYear: 2027,
      },
    } as unknown as RenewalSubmission['assessed'];

    expect(renewalSubmittedDetail(facts, seat)).toEqual({
      type: 'RENEWAL',
      branch: 'PAID_IN_CATALOG',
      state: 'PENDING',
      planId: 'plan-1',
      termMonths: 6,
      requesterEmployeeId: 'actor-1',
      beneficiaryEmployeeIds: ['holder-1'],
      departmentId: 'dep-1',
      costCenterId: 'cc-1',
      policyVersion: 1,
      hasSpendStep: true,
      slaWorkingDays: 2,
      pricingStatus: 'COMPUTED',
      amountMinor: '700',
      amountCurrency: 'VND',
      budgetYear: 2027,
      assignmentId: 'asg-1',
      previousExpectedEndDate: '2026-12-31',
      newExpectedEndDate: '2027-06-30',
      consecutiveMonths: 18,
    });
  });

  it('says in the second entry who the table named and why not', () => {
    expect(renewalRoutedDetail(sent(assigned), 'req-1')).toMatchObject({
      routingRow: 1,
      outcome: 'ASSIGNED',
      assigneeEmployeeId: 'head-1',
      role: 'MANAGER',
    });
    expect(renewalRoutedDetail(sent(waiting), 'req-1')).toMatchObject({
      outcome: 'WAITING',
      assigneeEmployeeId: null,
      role: null,
      waitingReason: 'NO_VALID_APPROVER',
    });
  });
});
