import type { InAppNotificationInput } from '../public/notifications.types';
import { refuseInAppNotification } from './inbox.policy';

const notice = (overrides: Partial<InAppNotificationInput> = {}): InAppNotificationInput => ({
  organizationId: '22222222-2222-4222-8222-222222222222',
  recipientEmployeeId: '33333333-3333-4333-8333-333333333333',
  code: 'REQUEST_GRANTED',
  subject: { type: 'ACCESS_REQUEST', id: '11111111-1111-4111-8111-111111111111' },
  params: {},
  eventKey: 'AUD:e1:MF23:-',
  ...overrides,
});

describe('the notices of MF-2 and MF-3 and of what goes with them (QĐ-110, QĐ-111)', () => {
  const ID = '44444444-4444-4444-8444-444444444444';
  const OTHER = '55555555-5555-4555-8555-555555555555';
  const cases: [InAppNotificationInput['code'], Record<string, string | number | boolean | null>][] = [
    ['REVOCATION_OVERDUE', { caseId: ID, employeeId: OTHER, dueOn: '2026-10-01', rightCount: 2 }],
    [
      'DEPARTURE_ACCESS_BLOCKED',
      {
        caseId: ID,
        employeeId: OTHER,
        departmentId: ID,
        blockedOn: '2026-09-30',
        revocationDueOn: '2026-10-01',
        audience: 'IT_ADMIN',
      },
    ],
    ['ACCOUNT_LOCK_OVERDUE', { caseId: ID, employeeId: OTHER, blockedOn: '2026-11-12' }],
    [
      'TRANSFER_GRACE_STARTED',
      {
        transferId: ID,
        employeeId: OTHER,
        fromDepartmentId: ID,
        toDepartmentId: OTHER,
        graceEndsOn: '2026-11-20',
        audience: 'MOVER',
      },
    ],
    ['TRANSFER_GRACE_ENDING', { transferId: ID, employeeId: OTHER, graceEndsOn: '2026-11-20' }],
    ['TRANSFER_RIGHTS_REVOKING', { transferId: ID, employeeId: OTHER, toDepartmentId: ID, rightCount: 2 }],
    ['REQUEST_CANCELLED_BENEFICIARY_GONE', { requestId: ID, beneficiaryEmployeeId: OTHER, reasonKind: 'DEPARTURE' }],
    ['DEPARTMENT_SOFTWARE_PROPOSED', { proposalId: ID, departmentId: OTHER, applicationId: ID, planId: null }],
    [
      'DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED',
      {
        proposalId: ID,
        departmentId: OTHER,
        applicationId: ID,
        planId: null,
        decision: 'REJECTED',
        reason: 'đã có công cụ khác',
      },
    ],
    ['VENDOR_ADMINS_BELOW_MINIMUM', { planId: ID, applicationId: OTHER, adminCount: 1 }],
    ['DEPARTMENT_WITHOUT_HEAD', { departmentId: ID, waitingCount: 3 }],
    [
      'SUBSCRIPTION_SEATS_INCREASED',
      { subscriptionId: ID, fromQuantity: 10, toQuantity: 11, requestId: OTHER, changedByEmployeeId: OTHER },
    ],
    [
      'IT_ADMIN_HANDOVER_PENDING',
      { sourceKind: 'OFFBOARDING_CASE', sourceId: ID, employeeId: OTHER, dueOn: '2026-11-12' },
    ],
  ];

  it.each(cases)('accepts %s with the keys of its code', (code, params) => {
    expect(refuseInAppNotification(notice({ code, subject: { type: 'THING', id: ID }, params }))).toBeNull();
  });

  it.each(cases)('refuses %s with a key that is not its own, and one that is a figure', (code, params) => {
    const subject = { type: 'THING', id: ID };

    expect(refuseInAppNotification(notice({ code, subject, params: { ...params, surprise: 'x' } }))).toEqual({
      reason: 'PARAM_KEY_NOT_ALLOWED',
      key: 'surprise',
    });
    expect(refuseInAppNotification(notice({ code, subject, params: { ...params, amount: 5 } }))).toEqual({
      reason: 'PARAM_KEY_NOT_ALLOWED',
      key: 'amount',
    });
  });
});
