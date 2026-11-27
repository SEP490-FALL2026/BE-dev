import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CommitmentHoldInput } from '../../budgets/public/budgets.types';
import { AccessRequestNotPriceableError } from '../access-request/access-request.errors';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { SpendEffectsService } from './spend-effects.service';

const TX = {} as DbTx;
const NOW = new Date('2026-11-15T03:00:00.000Z');
const ACTOR = { employeeId: 'emp-approver', roles: ['SPENDING_APPROVER'] } as never;

function makeService(
  overrides: {
    provisioningType?: 'K1' | 'K2' | 'K4';
    monthlyPriceMinor?: bigint | null;
    today?: string;
    employees?: { id: string; contractEndDate: string | null }[];
    reloadedRequest?: AccessRequestRecord;
    yearCostMinor?: bigint;
    checkYear?: number;
  } = {},
) {
  const holdForRequest = jest.fn<Promise<unknown[]>, [unknown, unknown, CommitmentHoldInput]>().mockResolvedValue([]);
  const requests = {
    findById: jest.fn().mockResolvedValue(overrides.reloadedRequest ?? null),
    setOneStepBlockedReason: jest.fn(),
    setState: jest.fn(),
  };
  const checkRepo = {
    findById: jest.fn().mockResolvedValue({
      id: 'chk-1',
      costCenterId: 'cc-1',
      currency: 'VND',
      years: [
        { code: 'WITHIN_BASE', year: overrides.checkYear ?? 2026, costMinor: overrides.yearCostMinor ?? 1_000_000n },
      ],
    }),
  };
  const catalog = {
    getPlanPrice: jest.fn().mockResolvedValue({
      kind: overrides.provisioningType === 'K4' ? 'ONE_TIME' : 'RECURRING',
      provisioningType: overrides.provisioningType ?? 'K2',
      unitPrice: { amountMinor: 500_000n, currency: 'VND' },
      monthlyPriceMinor: overrides.monthlyPriceMinor ?? 500_000n,
      billingCycle: 'MONTHLY',
    }),
    getPlanRevocationInfo: jest.fn().mockResolvedValue([]),
  };
  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue(overrides.today ?? '2026-11-15'),
    getEmployees: jest.fn().mockResolvedValue(overrides.employees ?? [{ id: 'e-1', contractEndDate: null }]),
  };
  const service = new SpendEffectsService(
    requests as never,
    {} as never,
    checkRepo as never,
    { holdForRequest } as never,
    catalog as never,
    { record: jest.fn() } as never,
    {} as never,
    organizationReads as never,
  );

  return { service, holdForRequest };
}

function baseRequest(over: Partial<AccessRequestRecord> = {}): AccessRequestRecord {
  return {
    id: 'req-1',
    organizationId: 'org-1',
    type: 'GRANT',
    branch: 'PAID_IN_CATALOG',
    state: 'AWAITING_SPEND_DECISION',
    planId: 'plan-1',
    requesterEmployeeId: 'e-req',
    departmentId: 'dep-1',
    costCenterId: 'cc-1',
    businessReason: 'Need tool',
    termMonths: null,
    pricing: {
      status: 'PRICED',
      missingReason: null,
      kind: 'RECURRING',
      budgetYear: 2026,
      expectedEndDate: null,
      amountMonths: 2,
      amount: { amountMinor: 1_000_000n, currency: 'VND' },
      unitPrice: { amountMinor: 500_000n, currency: 'VND' },
      monthlyPriceMinor: 500_000n,
      billingCycle: 'MONTHLY',
      nextYearAmount: null,
    },
    planLine: null,
    offPlan: false,
    expectedEndDate: null,
    policy: {} as never,
    submittedAt: NOW,
    ticket: null,
    withdrawal: null,
    cancellation: null,
    serviceAccount: null,
    renewal: null,
    beneficiaryEmployeeIds: ['e-1'],
    needStep: {} as never,
    needSteps: [],
    needDecision: null,
    lines: [],
    ...over,
  };
}

describe('SpendEffectsService (W3-07 monthly slicing on hold)', () => {
  it('passes monthly seat counts for K2 commitments from approval month through year end (Ca A: Nov, Dec)', async () => {
    const { service, holdForRequest } = makeService({ provisioningType: 'K2', today: '2026-11-15' });

    await service.hold(TX, ACTOR, baseRequest(), 'chk-1', NOW);

    expect(holdForRequest).toHaveBeenCalledWith(
      TX,
      ACTOR,
      expect.objectContaining({
        seatMonthlyMinor: 500_000n,
        months: [
          { month: '2026-11-01', seatCount: 1 },
          { month: '2026-12-01', seatCount: 1 },
        ],
      }),
    );
  });

  it('throws 409 ACCESS_REQUEST.NOT_PRICEABLE for RECURRING with null monthlyPriceMinor without falling back to catalog', async () => {
    const { service, holdForRequest } = makeService({
      provisioningType: 'K2',
      monthlyPriceMinor: 777_000n,
      today: '2026-11-15',
    });

    await expect(
      service.hold(
        TX,
        ACTOR,
        baseRequest({
          pricing: {
            ...baseRequest().pricing,
            unitPrice: { amountMinor: 10_000_000n, currency: 'VND' },
            monthlyPriceMinor: null,
            billingCycle: 'ANNUAL',
          },
        }),
        'chk-1',
        NOW,
      ),
    ).rejects.toBeInstanceOf(AccessRequestNotPriceableError);
    expect(holdForRequest).not.toHaveBeenCalled();
  });

  it('hold reads stored pricing.monthlyPriceMinor directly even when it differs from unitPrice / cycle and catalog', async () => {
    const { service, holdForRequest } = makeService({
      provisioningType: 'K2',
      monthlyPriceMinor: 999_000n,
      today: '2026-11-15',
    });

    await service.hold(
      TX,
      ACTOR,
      baseRequest({
        pricing: {
          ...baseRequest().pricing,
          unitPrice: { amountMinor: 10_000_000n, currency: 'VND' },
          monthlyPriceMinor: 777_000n,
          billingCycle: 'ANNUAL',
        },
      }),
      'chk-1',
      NOW,
    );

    expect(holdForRequest).toHaveBeenCalledWith(TX, ACTOR, expect.objectContaining({ seatMonthlyMinor: 777_000n }));
  });

  it('omits months for K1 and K4 commitments', async () => {
    const k1 = makeService({ provisioningType: 'K1', today: '2026-11-15' });
    await k1.service.hold(TX, ACTOR, baseRequest(), 'chk-1', NOW);
    expect(k1.holdForRequest.mock.calls[0][2].months).toBeUndefined();

    const k4 = makeService({ provisioningType: 'K4', today: '2026-11-15', monthlyPriceMinor: null });
    await k4.service.hold(
      TX,
      ACTOR,
      baseRequest({
        pricing: {
          ...baseRequest().pricing,
          kind: 'ONE_TIME',
          amountMonths: null,
          monthlyPriceMinor: null,
          billingCycle: 'OTHER',
        },
      }),
      'chk-1',
      NOW,
    );
    expect(k4.holdForRequest.mock.calls[0][2].months).toBeUndefined();
  });

  it('aggregates per-person approved group lines respecting contract cuts for K2', async () => {
    const groupReq = baseRequest({
      type: 'GROUP_GRANT',
      termMonths: 3,
      beneficiaryEmployeeIds: ['e-1', 'e-2'],
      lines: [
        { employeeId: 'e-1', state: 'APPROVED', expectedEndDate: null } as never,
        { employeeId: 'e-2', state: 'APPROVED', expectedEndDate: null } as never,
      ],
      pricing: {
        ...baseRequest().pricing,
        budgetYear: 2027,
        amountMonths: 4,
      },
    });
    const { service, holdForRequest } = makeService({
      provisioningType: 'K2',
      today: '2027-03-15',
      checkYear: 2027,
      yearCostMinor: 3_500_000n,
      reloadedRequest: groupReq,
      employees: [
        { id: 'e-1', contractEndDate: null },
        { id: 'e-2', contractEndDate: '2027-05-10' },
      ],
    });

    await service.hold(TX, ACTOR, groupReq, 'chk-1', NOW, 2);

    expect(holdForRequest.mock.calls[0][2].months).toEqual([
      { month: '2027-03-01', seatCount: 2 },
      { month: '2027-04-01', seatCount: 2 },
      { month: '2027-05-01', seatCount: 2 },
      { month: '2027-06-01', seatCount: 1 },
    ]);
  });
});
