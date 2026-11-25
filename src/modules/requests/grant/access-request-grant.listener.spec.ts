import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { BudgetsApi } from '../../budgets/public/budgets.api';
import type { LicensingApi } from '../../licensing/public/licensing.api';
import type { GrantRequestGateHook } from '../../licensing/public/licensing.extension-points';
import type { GrantOutcomeFacts } from '../../licensing/public/licensing.types';
import type { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { GroupGrantService } from '../group-request/group-grant.service';
import type { LineAmountRepo } from '../group-request/line-amount.repo';
import type { RequestOutcomeService } from '../outcome/request-outcome.service';
import type { RenewalApplyService } from '../renewal-apply/renewal-apply.service';
import { AccessRequestGrantGate } from './access-request-grant.listener';
import { GrantSettlementService } from './grant-settlement.service';
import type { SeatReleaseService } from './seat-release.service';

const TX = {} as DbTx;

function requestOf(over: Partial<AccessRequestRecord> = {}): AccessRequestRecord {
  return {
    id: 'req-1',
    organizationId: 'org-1',
    type: 'GRANT',
    branch: 'PAID',
    state: 'EXECUTING',
    planId: 'plan-1',
    requesterEmployeeId: 'emp-req',
    beneficiaryEmployeeIds: ['emp-1'],
    departmentId: 'dept-1',
    costCenterId: 'cc-1',
    businessReason: 'Need seat',
    termMonths: null,
    pricing: {
      status: 'PRICED',
      missingReason: null,
      kind: 'RECURRING',
      budgetYear: 2026,
      expectedEndDate: null,
      amountMonths: 10,
      amount: { amountMinor: 5_000_000n, currency: 'VND' },
      unitPrice: { amountMinor: 500_000n, currency: 'VND' },
      billingCycle: 'ANNUAL',
      nextYearAmount: null,
    },
    policy: {
      kind: 'BUDGET_CHECKED',
      approvalRule: 'STANDARD',
      requiresDepartmentHead: true,
      requiresSpendingApprover: true,
      requiresFinanceReview: false,
      autoApprovedReason: null,
    },
    expectedEndDate: null,
    createdAt: new Date('2026-03-10T00:00:00.000Z'),
    createdByAppUserId: 'u-1',
    needSteps: [],
    lines: [],
    ...over,
  } as unknown as AccessRequestRecord;
}

function factsOf(over: Partial<GrantOutcomeFacts> = {}): GrantOutcomeFacts {
  return {
    taskId: 'task-1',
    fromPool: true,
    provisioningType: 'K2',
    grantedOn: '2026-03-10',
    assignmentId: 'assign-1',
    effectiveFrom: '2026-03-10',
    expectedEndDate: null,
    ...over,
  };
}

function build(
  opts: {
    request?: AccessRequestRecord | null;
    commitments?: { requestId: string; amountMinor: bigint; currency: string }[];
    lineAmounts?: { employeeId: string; held: boolean }[];
  } = {},
) {
  const lockById = jest.fn().mockResolvedValue(opts.request === undefined ? requestOf() : opts.request);
  const setGrantOutcome = jest.fn().mockResolvedValue(undefined);
  const releaseForRequest = jest.fn().mockResolvedValue([]);
  const committedByRequests = jest.fn().mockResolvedValue(opts.commitments ?? []);
  const recordAvoidedCost = jest.fn().mockResolvedValue(undefined);
  const lineAmountsOf = jest.fn().mockResolvedValue(opts.lineAmounts ?? []);
  const settlement = new GrantSettlementService(
    { releaseForRequest, committedByRequests } as unknown as BudgetsApi,
    { recordAvoidedCost } as unknown as LicensingApi,
    { of: lineAmountsOf } as unknown as LineAmountRepo,
  );
  const gate = new AccessRequestGrantGate(
    { lockById, setGrantOutcome } as unknown as AccessRequestRepo,
    { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
    settlement,
    { report: jest.fn().mockResolvedValue(undefined) } as unknown as GroupGrantService,
    { granted: jest.fn().mockResolvedValue(undefined), ended: jest.fn() } as unknown as RequestOutcomeService,
    { afterGrant: jest.fn().mockResolvedValue(undefined) } as unknown as SeatReleaseService,
    { bind: jest.fn() } as unknown as GrantRequestGateHook,
    {} as unknown as RenewalApplyService,
  );

  return { gate, releaseForRequest, recordAvoidedCost, lineAmountsOf };
}

describe('AccessRequestGrantGate avoided cost on pool grant (W3-09, B1-R8)', () => {
  it('records 100% of year commitment for single K2 pool grant regardless of elapsed days', async () => {
    const { gate, recordAvoidedCost } = build({
      request: requestOf(),
      commitments: [{ requestId: 'req-1', amountMinor: 5_000_000n, currency: 'VND' }],
    });

    await gate.reportOutcome(
      TX,
      'req-1',
      'COMPLETED',
      'emp-1',
      factsOf({ grantedOn: '2026-05-20', effectiveFrom: '2026-05-20' }),
    );

    expect(recordAvoidedCost).toHaveBeenCalledTimes(1);
    expect(recordAvoidedCost).toHaveBeenCalledWith(TX, 'task-1', { amountMinor: 5_000_000n, currency: 'VND' });
  });

  it('divides group K2 year commitment across committed seats via lineAmounts', async () => {
    const { gate, recordAvoidedCost } = build({
      request: requestOf({ type: 'GROUP_GRANT', beneficiaryEmployeeIds: ['e1', 'e2', 'e3'] }),
      commitments: [{ requestId: 'req-1', amountMinor: 15_000_000n, currency: 'VND' }],
      lineAmounts: [
        { employeeId: 'e1', held: true },
        { employeeId: 'e2', held: true },
        { employeeId: 'e3', held: true },
        { employeeId: 'e1', held: false },
      ],
    });

    await gate.reportOutcome(TX, 'req-1', 'COMPLETED', 'e1', factsOf());

    expect(recordAvoidedCost).toHaveBeenCalledTimes(1);
    expect(recordAvoidedCost).toHaveBeenCalledWith(TX, 'task-1', { amountMinor: 5_000_000n, currency: 'VND' });
  });

  it('releases K4 commitment AND records avoided cost from request.pricing.amount when granted from pool', async () => {
    const { gate, releaseForRequest, recordAvoidedCost } = build({
      request: requestOf({
        pricing: {
          ...requestOf().pricing,
          kind: 'ONE_TIME',
          amount: { amountMinor: 2_000_000n, currency: 'VND' },
        },
      }),
    });

    await gate.reportOutcome(TX, 'req-1', 'COMPLETED', 'emp-1', factsOf({ provisioningType: 'K4', fromPool: true }));

    expect(releaseForRequest).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ requestId: 'req-1', reason: 'GRANTED_FROM_POOL' }),
    );
    expect(recordAvoidedCost).toHaveBeenCalledWith(TX, 'task-1', { amountMinor: 2_000_000n, currency: 'VND' });
  });

  it('does not record avoided cost when fromPool is false or grant failed', async () => {
    const { gate, recordAvoidedCost } = build({
      commitments: [{ requestId: 'req-1', amountMinor: 5_000_000n, currency: 'VND' }],
    });

    await gate.reportOutcome(TX, 'req-1', 'COMPLETED', 'emp-1', factsOf({ fromPool: false }));
    await gate.reportOutcome(TX, 'req-1', 'FAILED', 'emp-1', factsOf({ fromPool: true }));

    expect(recordAvoidedCost).not.toHaveBeenCalled();
  });
});
