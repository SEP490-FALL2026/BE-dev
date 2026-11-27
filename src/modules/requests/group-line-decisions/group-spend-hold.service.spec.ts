import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNotPriceableError } from '../access-request/access-request.errors';
import type { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { LineAmountRepo, NewLineAmount } from '../group-request/line-amount.repo';
import type { RequestTermEndsService } from '../repricing/request-term-ends.service';
import type { SpendEffectsService } from '../spend-effects/spend-effects.service';
import { GroupSpendHold } from './group-spend-hold.service';

const TX = {} as DbTx;
const ACTOR = { employeeId: 'emp-approver' } as AuthenticatedPrincipal;
const NOW = new Date('2027-11-15T00:00:00.000Z');

function groupRequestOf(over: Partial<AccessRequestRecord> = {}): AccessRequestRecord {
  return {
    id: 'req-group-1',
    organizationId: 'org-1',
    type: 'GROUP_GRANT',
    branch: 'PAID_IN_CATALOG',
    state: 'AWAITING_SPEND_DECISION',
    planId: 'plan-k2',
    requesterEmployeeId: 'emp-req',
    beneficiaryEmployeeIds: ['emp-1'],
    departmentId: 'dept-1',
    costCenterId: 'cc-1',
    businessReason: 'Need seats',
    termMonths: null,
    pricing: {
      status: 'PRICED',
      missingReason: null,
      kind: 'RECURRING',
      budgetYear: 2027,
      expectedEndDate: null,
      amountMonths: 2,
      amount: { amountMinor: 1_000_000n, currency: 'VND' },
      unitPrice: { amountMinor: 500_000n, currency: 'VND' },
      monthlyPriceMinor: 500_000n,
      billingCycle: 'MONTHLY',
      nextYearAmount: { amountMinor: 1_000_000n, currency: 'VND' },
    },
    expectedEndDate: null,
    lines: [{ employeeId: 'emp-1', state: 'WAITING_SPEND', expectedEndDate: '2028-02-10' }],
    ...over,
  } as unknown as AccessRequestRecord;
}

describe('GroupSpendHold (FIX-B1 F1)', () => {
  it('writes K2 calendar-month nextYear row (held=false) and keeps 83,333/month for ANNUAL 1,000,001', async () => {
    const inserted: NewLineAmount[][] = [];
    const setPricing = jest.fn().mockResolvedValue(undefined);
    const holdEffects = jest.fn().mockResolvedValue({
      id: 'chk-1',
      currency: 'VND',
      years: [{ year: 2027, code: 'BUDGET_OK', costMinor: 1_000_000n }],
    });
    const getPlanPrice = jest.fn().mockResolvedValue({
      kind: 'RECURRING',
      provisioningType: 'K2',
      unitPrice: { amountMinor: 500_000n, currency: 'VND' },
      monthlyPriceMinor: 500_000n,
      billingCycle: 'MONTHLY',
    });

    const service = new GroupSpendHold(
      { setPricing } as unknown as AccessRequestRepo,
      {
        insertMany: jest.fn((_tx: DbTx, rows: NewLineAmount[]) => {
          inserted.push(rows);
          return Promise.resolve();
        }),
      } as unknown as LineAmountRepo,
      { hold: holdEffects } as unknown as SpendEffectsService,
      { businessToday: jest.fn().mockResolvedValue('2027-11-15') } as unknown as OrganizationReadApi,
      { endsOfPeople: jest.fn().mockResolvedValue(['2028-02-10']) } as unknown as RequestTermEndsService,
      { getPlanPrice } as unknown as CatalogApi,
    );

    // Scenario 1: K2 2027-11-15 -> 2028-02-10 at 500,000/month => next-year line amount must be 1,000,000 (Jan+Feb 2028).
    await service.hold(TX, ACTOR, groupRequestOf(), [{ employeeId: 'emp-1', decision: 'APPROVE' }], {
      checkId: 'chk-1',
      now: NOW,
    });

    expect(inserted[0]).toEqual([
      {
        requestId: 'req-group-1',
        employeeId: 'emp-1',
        budgetYear: 2027,
        amountMinor: 1_000_000n,
        currency: 'VND',
        held: true,
      },
      {
        requestId: 'req-group-1',
        employeeId: 'emp-1',
        budgetYear: 2028,
        amountMinor: 1_000_000n,
        currency: 'VND',
        held: false,
      },
    ]);

    // Scenario 2: ANNUAL 1,000,001 with stored monthlyPriceMinor = 83,333 => 2 months in 2028 = 166,666 (not 166,668 / 83,334).
    inserted.length = 0;
    setPricing.mockClear();
    holdEffects.mockResolvedValueOnce({
      id: 'chk-2',
      currency: 'VND',
      years: [{ year: 2027, code: 'BUDGET_OK', costMinor: 166_666n }],
    });
    getPlanPrice.mockResolvedValueOnce({
      kind: 'RECURRING',
      provisioningType: 'K2',
      unitPrice: { amountMinor: 1_000_001n, currency: 'VND' },
      monthlyPriceMinor: 83_333n,
      billingCycle: 'ANNUAL',
    });
    const annualReq = groupRequestOf({
      pricing: {
        status: 'PRICED',
        missingReason: null,
        kind: 'RECURRING',
        budgetYear: 2027,
        expectedEndDate: null,
        amountMonths: 2,
        amount: { amountMinor: 166_666n, currency: 'VND' },
        unitPrice: { amountMinor: 1_000_001n, currency: 'VND' },
        monthlyPriceMinor: 83_333n,
        billingCycle: 'ANNUAL',
        nextYearAmount: { amountMinor: 100n, currency: 'VND' },
      },
    });
    await service.hold(TX, ACTOR, annualReq, [{ employeeId: 'emp-1', decision: 'APPROVE' }], {
      checkId: 'chk-2',
      now: NOW,
    });

    expect(inserted[0]).toEqual([
      {
        requestId: 'req-group-1',
        employeeId: 'emp-1',
        budgetYear: 2027,
        amountMinor: 166_666n,
        currency: 'VND',
        held: true,
      },
      {
        requestId: 'req-group-1',
        employeeId: 'emp-1',
        budgetYear: 2028,
        amountMinor: 166_666n,
        currency: 'VND',
        held: false,
      },
    ]);
    expect(setPricing).toHaveBeenCalledWith(
      TX,
      'req-group-1',
      expect.objectContaining({ nextYearAmount: { amountMinor: 166_666n, currency: 'VND' } }),
    );
  });

  it('B-5: throws AccessRequestNotPriceableError when RECURRING pricing.monthlyPriceMinor is null even with catalog price', async () => {
    const insertMany = jest.fn();
    const service = new GroupSpendHold(
      { setPricing: jest.fn() } as unknown as AccessRequestRepo,
      { insertMany } as unknown as LineAmountRepo,
      {
        hold: jest.fn().mockResolvedValue({
          id: 'chk-1',
          currency: 'VND',
          years: [{ year: 2027, code: 'WITHIN_BASE', costMinor: 0n }],
        }),
      } as unknown as SpendEffectsService,
      { businessToday: jest.fn().mockResolvedValue('2027-11-15') } as unknown as OrganizationReadApi,
      { endsOfPeople: jest.fn().mockResolvedValue(['2028-02-10']) } as unknown as RequestTermEndsService,
      {
        getPlanPrice: jest.fn().mockResolvedValue({
          kind: 'RECURRING',
          provisioningType: 'K2',
          unitPrice: { amountMinor: 500_000n, currency: 'VND' },
          monthlyPriceMinor: 500_000n,
          billingCycle: 'MONTHLY',
        }),
      } as unknown as CatalogApi,
    );

    const noMonthlyReq = groupRequestOf({
      pricing: {
        ...groupRequestOf().pricing,
        monthlyPriceMinor: null,
      },
    });

    await expect(
      service.hold(TX, ACTOR, noMonthlyReq, [{ employeeId: 'emp-1', decision: 'APPROVE' }], {
        checkId: 'chk-1',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(AccessRequestNotPriceableError);
    expect(insertMany).not.toHaveBeenCalled();
  });
});
