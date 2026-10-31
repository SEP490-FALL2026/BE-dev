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
  samePersonAsSpend: true,
};
const waiting = { outcome: 'WAITING', row: 8, reason: 'NO_VALID_APPROVER' };

const sent = (decision: unknown, byHead: boolean): RenewalSubmission => ({
  actor: { employeeId: 'actor-1', appUserId: 'user-1' },
  organizationId: 'org-1',
  holder: { employeeId: 'holder-1', planId: 'plan-1' },
  body: { businessReason: 'Gia hạn cho dự án', projectLabel: 'P-1' },
  termMonths: 6,
  newEnd: '2027-06-30',
  byHead,
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
    expect(renewalRequestOf(sent(assigned, false))).toMatchObject({
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
      projectLabel: 'P-1',
      expectedEndDate: '2027-06-30',
      createdByAppUserId: 'user-1',
    });
  });

  it('leaves the need step to the routing table when the holder asks, pending or waiting under control', () => {
    expect(renewalRequestOf(sent(assigned, false))).toMatchObject({
      state: 'PENDING',
      needStep: {
        state: 'PENDING',
        assigneeEmployeeId: 'head-1',
        routingRow: 1,
        waitingReason: null,
        samePersonAsSpend: true,
        slaWorkingDays: 2,
      },
    });
    expect(renewalRequestOf(sent(waiting, false))).toMatchObject({
      state: 'WAITING_CONTROLLED',
      needStep: {
        state: 'WAITING',
        assigneeEmployeeId: null,
        routingRow: 8,
        waitingReason: 'NO_VALID_APPROVER',
        samePersonAsSpend: false,
      },
    });
  });

  it('has the head who sends it confirm the need by sending: pending with the head in the row of the head who sends for others', () => {
    expect(renewalRequestOf(sent(waiting, true))).toMatchObject({
      state: 'PENDING',
      needStep: {
        state: 'PENDING',
        assigneeEmployeeId: 'actor-1',
        routingRow: 5,
        waitingReason: null,
        samePersonAsSpend: false,
        slaWorkingDays: 2,
      },
    });
  });

  it('has no project label and no Cost Center when none is given', () => {
    const facts = sent(assigned, false);
    facts.body = { businessReason: 'x' };
    (facts.assessed.unit as { costCenter: unknown }).costCenter = null;

    expect(renewalRequestOf(facts)).toMatchObject({ projectLabel: null, costCenterId: null });
  });

  it('starts pending when the head confirmed the need or the table named somebody (byHead, tableNamedSomebody), and waits under control otherwise', () => {
    expect(renewalStateOf(true, false)).toBe('PENDING');
    expect(renewalStateOf(false, true)).toBe('PENDING');
    expect(renewalStateOf(false, false)).toBe('WAITING_CONTROLLED');
  });
});

describe('the audit entries of a request that asks to renew a right (US-05-14)', () => {
  const seat = { assignmentId: 'asg-1', previousEnd: '2026-12-31', consecutiveMonths: 18 };

  it('says in the first entry what was asked, the seat, the ends, what it was judged by and whether the sending confirmed the need', () => {
    const facts = sent(assigned, false);
    facts.assessed = {
      ...facts.assessed,
      pricing: {
        status: 'COMPUTED',
        amount: { amountMinor: 700n, currency: 'VND' },
        budgetYear: 2027,
        expectedSpendOn: '2027-01-01',
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
      expectedSpendOn: '2027-01-01',
      delegated: false,
      assignmentId: 'asg-1',
      previousExpectedEndDate: '2026-12-31',
      newExpectedEndDate: '2027-06-30',
      consecutiveMonths: 18,
    });
  });

  it('says in the second entry that the sending confirmed the need, or who the table named and why not', () => {
    expect(renewalRoutedDetail(sent(waiting, true), 'req-1')).toEqual({
      type: 'RENEWAL',
      requestId: 'req-1',
      routingRow: 5,
      outcome: 'CONFIRMED_BY_SENDING',
      assigneeEmployeeId: 'actor-1',
      role: 'MANAGER',
      waitingReason: null,
      samePersonAsSpend: false,
      requesterEmployeeId: 'actor-1',
      beneficiaryEmployeeId: 'holder-1',
      departmentId: 'dep-1',
      departmentHeadEmployeeId: undefined,
    });
    expect(renewalRoutedDetail(sent(assigned, false), 'req-1')).toMatchObject({
      routingRow: 1,
      outcome: 'ASSIGNED',
      assigneeEmployeeId: 'head-1',
      role: 'MANAGER',
      samePersonAsSpend: true,
    });
    expect(renewalRoutedDetail(sent(waiting, false), 'req-1')).toMatchObject({
      outcome: 'WAITING',
      assigneeEmployeeId: null,
      role: null,
      waitingReason: 'NO_VALID_APPROVER',
      samePersonAsSpend: false,
    });
  });
});
