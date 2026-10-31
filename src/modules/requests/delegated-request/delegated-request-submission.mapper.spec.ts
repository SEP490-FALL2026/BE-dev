import {
  DELEGATED_ROW,
  delegatedRequestOf,
  delegatedRoutedDetail,
  delegatedSubmittedDetail,
  type DelegatedSubmission,
} from './delegated-request-submission.mapper';

const assigned = {
  outcome: 'ASSIGNED',
  row: 6,
  role: 'SPENDING_APPROVER',
  assigneeEmployeeId: 'appr-1',
  samePersonAsSpend: true,
};
const waiting = { outcome: 'WAITING', row: 8, reason: 'NO_VALID_APPROVER' };

const sent = (decision: unknown, delegated: boolean): DelegatedSubmission => ({
  actor: { employeeId: 'head-1', appUserId: 'user-1' },
  organizationId: 'org-1',
  beneficiaryId: 'emp-2',
  delegated,
  item: { planId: 'plan-1', expectedSpendOn: '2026-11-01' },
  body: { businessReason: 'Cho dự án', termMonths: 6, expectedEndDate: '2027-04-30' },
  batchId: 'batch-1',
  now: new Date('2026-10-30T03:00:00Z'),
  assessed: {
    unit: { departmentId: 'dep-1', costCenter: { id: 'cc-1' } },
    policy: { branch: 'PAID_IN_CATALOG', version: 3, slaWorkingDays: 2, chain: ['NEED', 'SPEND_APPROVAL'] },
    pricing: {
      status: 'COMPUTED',
      amount: { amountMinor: 900n, currency: 'VND' },
      budgetYear: 2026,
      expectedSpendOn: '2026-11-01',
    },
    routing: { decision, departmentHeadEmployeeId: 'head-1' },
  } as unknown as DelegatedSubmission['assessed'],
});

describe('the row, and the audit entries, of a request a head sends for somebody else (US-03-02, US-05-03 AC-6)', () => {
  it('confirms the need by sending: pending with the head in the row of the head who sends for others, and the end asked for', () => {
    expect(delegatedRequestOf(sent(waiting, true))).toMatchObject({
      organizationId: 'org-1',
      state: 'PENDING',
      planId: 'plan-1',
      requesterEmployeeId: 'head-1',
      beneficiaryEmployeeIds: ['emp-2'],
      delegatedBatchId: 'batch-1',
      expectedEndDate: '2027-04-30',
      needStep: { state: 'PENDING', assigneeEmployeeId: 'head-1', routingRow: DELEGATED_ROW, waitingReason: null },
    });
  });

  it('leaves the head own share to the routing table, with no end date, pending or waiting under control', () => {
    expect(delegatedRequestOf(sent(assigned, false))).toMatchObject({
      state: 'PENDING',
      expectedEndDate: null,
      needStep: { state: 'PENDING', assigneeEmployeeId: 'appr-1', routingRow: 6, samePersonAsSpend: true },
    });
    expect(delegatedRequestOf(sent(waiting, false))).toMatchObject({
      state: 'WAITING_CONTROLLED',
      needStep: { state: 'WAITING', assigneeEmployeeId: null, routingRow: 8, waitingReason: 'NO_VALID_APPROVER' },
    });
  });

  it('says in the first entry what was asked, for whom, in which batch, and whether the sending confirmed the need', () => {
    expect(delegatedSubmittedDetail(sent(assigned, true))).toMatchObject({
      branch: 'PAID_IN_CATALOG',
      state: 'PENDING',
      planId: 'plan-1',
      beneficiaryEmployeeIds: ['emp-2'],
      costCenterId: 'cc-1',
      policyVersion: 3,
      hasSpendStep: true,
      amountMinor: '900',
      delegated: true,
      delegatedBatchId: 'batch-1',
      expectedEndDate: '2027-04-30',
    });
  });

  it('says in the second entry that the sending confirmed the need, or who the table named and why not', () => {
    expect(delegatedRoutedDetail(sent(waiting, true), 'req-1')).toEqual({
      requestId: 'req-1',
      routingRow: DELEGATED_ROW,
      outcome: 'CONFIRMED_BY_SENDING',
      assigneeEmployeeId: 'head-1',
      role: 'MANAGER',
      waitingReason: null,
      samePersonAsSpend: false,
      requesterEmployeeId: 'head-1',
      beneficiaryEmployeeId: 'emp-2',
      departmentId: 'dep-1',
      departmentHeadEmployeeId: 'head-1',
    });
    expect(delegatedRoutedDetail(sent(assigned, false), 'req-1')).toMatchObject({
      routingRow: 6,
      outcome: 'ASSIGNED',
      assigneeEmployeeId: 'appr-1',
      role: 'SPENDING_APPROVER',
      samePersonAsSpend: true,
    });
    expect(delegatedRoutedDetail(sent(waiting, false), 'req-1')).toMatchObject({
      outcome: 'WAITING',
      assigneeEmployeeId: null,
      role: null,
      waitingReason: 'NO_VALID_APPROVER',
      samePersonAsSpend: false,
    });
  });
});
