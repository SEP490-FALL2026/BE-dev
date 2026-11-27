import type { DbTx, TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { CatalogApi } from '../../../catalog/public/catalog.api';
import type { BudgetFactsRepo } from '../../budget/budget-facts.repo';
import type { CommitmentRepo } from '../../budget/commitment.repo';
import { CommitmentRequestFactsHook } from '../../public/budgets.extension-points';
import type { CommitmentMonthRepo } from './commitment-month.repo';
import { CommitmentMonthSettlementService } from './commitment-month-settlement.service';

const TX = {} as DbTx;
const ORG = 'org-1';
const NOW = new Date('2027-01-02T01:00:00.000Z');

function setup(
  overrides: {
    unsettledForMonth?: Array<{
      commitmentId: string;
      requestId: string;
      costCenterId: string;
      year: number;
      currency: string;
      month: string;
      seatCount: number;
      shareMinor: bigint;
      appliedMinor: bigint;
      releasedMinor: bigint;
      settledAt: Date | null;
    }>;
    commitmentsById?: Record<
      string,
      {
        id: string;
        requestId: string;
        year: number;
        amountMinor: bigint;
        releasedMinor: bigint;
        appliedMinor: bigint;
        currency: string;
        state: 'HELD' | 'RELEASED' | 'EXPENSED';
        organizationId: string;
        costCenterId: string;
        attachedVersionId: string | null;
      }
    >;
    slicesByCommitment?: Record<
      string,
      Array<{
        commitmentId: string;
        month: string;
        seatCount: number;
        shareMinor: bigint;
        appliedMinor: bigint;
        releasedMinor: bigint;
        settledAt: Date | null;
      }>
    >;
    heldYearsBefore?: number[];
    unsettledYearsBefore?: number[];
    unsettledMonthsInYear?: Record<number, string[]>;
    heldByYear?: Record<
      number,
      Array<{
        id: string;
        requestId: string;
        organizationId: string;
        costCenterId: string;
        year: number;
        amountMinor: bigint;
        releasedMinor: bigint;
        appliedMinor: bigint;
        state: 'HELD' | 'RELEASED' | 'EXPENSED';
        attachedVersionId: string | null;
      }>
    >;
    planKindByRequest?: Record<string, 'K1' | 'K2' | 'K4'>;
  } = {},
) {
  const lockCalls: string[] = [];
  const commitments = {
    lockById: jest.fn((_tx: unknown, id: string) => {
      lockCalls.push(`commitment:${id}`);
      return Promise.resolve(overrides.commitmentsById?.[id] ?? null);
    }),
    release: jest.fn().mockResolvedValue({ released: true, heldMinor: 0n }),
  };
  const budgetFacts = {
    listHeldYearsBefore: jest.fn().mockResolvedValue(overrides.heldYearsBefore ?? []),
    listHeldByYear: jest.fn((_org: string, yr: number) => Promise.resolve(overrides.heldByYear?.[yr] ?? [])),
  };
  const commitmentMonths = {
    lockOrganizationMonth: jest.fn((_tx: unknown, _org: string, month: string) => {
      lockCalls.push(`advisory:${month}`);
      return Promise.resolve();
    }),
    listUnsettledForMonth: jest.fn().mockResolvedValue(overrides.unsettledForMonth ?? []),
    lockOfCommitment: jest.fn((_tx: unknown, id: string) => {
      lockCalls.push(`slices:${id}`);
      return Promise.resolve(overrides.slicesByCommitment?.[id] ?? []);
    }),
    addReleased: jest.fn().mockResolvedValue(undefined),
    markSettled: jest.fn().mockResolvedValue(undefined),
    listUnsettledYearsBefore: jest.fn().mockResolvedValue(overrides.unsettledYearsBefore ?? []),
    listUnsettledMonthsInYear: jest.fn((_org: string, yr: number) =>
      Promise.resolve(overrides.unsettledMonthsInYear?.[yr] ?? []),
    ),
  };
  const yearLock = {
    lock: jest.fn((_tx: unknown, ccId: string, years: number[]) => {
      lockCalls.push(`cc:${ccId}:${years.join(',')}`);
      return Promise.resolve();
    }),
  };
  const requestFacts = new CommitmentRequestFactsHook();
  requestFacts.bind({
    factsOf: jest.fn((ids: readonly string[]) =>
      Promise.resolve(
        new Map(
          ids.map((id) => [
            id,
            {
              id,
              software: { name: 'App' },
              plan: { name: 'Plan' },
              planId: `plan-${id}`,
              requester: { employeeCode: 'E1', fullName: 'User' },
              beneficiaryCount: 1,
              spendApprovedAt: NOW,
              vendorId: null,
            },
          ]),
        ),
      ),
    ),
  });
  const catalog = {
    getPlanRevocationInfo: jest.fn((planIds: readonly string[]) =>
      Promise.resolve(
        planIds.map((pid) => {
          const reqId = pid.replace(/^plan-/, '');
          return { planId: pid, provisioningType: overrides.planKindByRequest?.[reqId] ?? 'K2' };
        }),
      ),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const runner = { run: <T>(fn: (tx: DbTx) => Promise<T>) => fn(TX) } as unknown as TransactionRunner;

  const service = new CommitmentMonthSettlementService(
    runner,
    commitments as unknown as CommitmentRepo,
    budgetFacts as unknown as BudgetFactsRepo,
    commitmentMonths as unknown as CommitmentMonthRepo,
    yearLock,
    audit as unknown as AuditApi,
    catalog as unknown as CatalogApi,
    requestFacts,
  );

  return { service, commitments, commitmentMonths, yearLock, audit, lockCalls };
}

describe('CommitmentMonthSettlementService (W3-07)', () => {
  it('Ca C + lock order + E1: settles December slice (500k MONTH_END) and respects 0 -> 9 -> 9b -> 10 (only if attached)', async () => {
    const attached = setup({
      unsettledForMonth: [
        {
          commitmentId: 'c-1',
          requestId: 'req-1',
          costCenterId: 'cc-1',
          year: 2026,
          currency: 'VND',
          month: '2026-12-01',
          seatCount: 1,
          shareMinor: 500_000n,
          appliedMinor: 0n,
          releasedMinor: 0n,
          settledAt: null,
        },
      ],
      commitmentsById: {
        'c-1': {
          id: 'c-1',
          requestId: 'req-1',
          year: 2026,
          amountMinor: 500_000n,
          releasedMinor: 0n,
          appliedMinor: 0n,
          currency: 'VND',
          state: 'HELD',
          organizationId: ORG,
          costCenterId: 'cc-1',
          attachedVersionId: 'v-1',
        },
      },
      slicesByCommitment: {
        'c-1': [
          {
            commitmentId: 'c-1',
            month: '2026-12-01',
            seatCount: 1,
            shareMinor: 500_000n,
            appliedMinor: 0n,
            releasedMinor: 0n,
            settledAt: null,
          },
        ],
      },
    });

    const res = await attached.service.settleMonth(ORG, '2026-12-01', NOW);
    expect(res).toEqual({ settledSlices: 1, settledCommitments: 1, releasedMinor: 500_000n });
    expect(attached.lockCalls).toEqual(['advisory:2026-12-01', 'commitment:c-1', 'slices:c-1', 'cc:cc-1:2026']);
    expect(attached.commitmentMonths.addReleased).toHaveBeenCalledWith(TX, 'c-1', '2026-12-01', 500_000n);
    expect(attached.commitmentMonths.markSettled).toHaveBeenCalledWith(TX, 'c-1', '2026-12-01', NOW);
    expect(attached.commitments.release).toHaveBeenCalledWith(TX, expect.objectContaining({ id: 'c-1' }), {
      takeMinor: 500_000n,
      reason: 'MONTH_END',
      reasonText: 'month:2026-12-01',
      releasedByEmployeeId: null,
      now: NOW,
    });

    // E1: unattached commitment must NOT lock CC-year
    const waiting = setup({
      unsettledForMonth: [
        {
          commitmentId: 'c-w',
          requestId: 'req-w',
          costCenterId: 'cc-w',
          year: 2026,
          currency: 'VND',
          month: '2026-12-01',
          seatCount: 1,
          shareMinor: 500_000n,
          appliedMinor: 0n,
          releasedMinor: 0n,
          settledAt: null,
        },
      ],
      commitmentsById: {
        'c-w': {
          id: 'c-w',
          requestId: 'req-w',
          year: 2026,
          amountMinor: 500_000n,
          releasedMinor: 0n,
          appliedMinor: 0n,
          currency: 'VND',
          state: 'HELD',
          organizationId: ORG,
          costCenterId: 'cc-w',
          attachedVersionId: null,
        },
      },
      slicesByCommitment: {
        'c-w': [
          {
            commitmentId: 'c-w',
            month: '2026-12-01',
            seatCount: 1,
            shareMinor: 500_000n,
            appliedMinor: 0n,
            releasedMinor: 0n,
            settledAt: null,
          },
        ],
      },
    });
    await waiting.service.settleMonth(ORG, '2026-12-01', NOW);
    expect(waiting.yearLock.lock).not.toHaveBeenCalled();
  });

  it('F6(b): when slice remaining is 0đ, marks settled_at without inserting a 0đ budget_commitment_releases row', async () => {
    const { service, commitments, commitmentMonths } = setup({
      unsettledForMonth: [
        {
          commitmentId: 'c-1',
          requestId: 'req-1',
          costCenterId: 'cc-1',
          year: 2026,
          currency: 'VND',
          month: '2026-11-01',
          seatCount: 1,
          shareMinor: 500_000n,
          appliedMinor: 166_667n,
          releasedMinor: 333_333n,
          settledAt: null,
        },
      ],
      commitmentsById: {
        'c-1': {
          id: 'c-1',
          requestId: 'req-1',
          year: 2026,
          amountMinor: 1_000_000n,
          releasedMinor: 333_333n,
          appliedMinor: 166_667n,
          currency: 'VND',
          state: 'HELD',
          organizationId: ORG,
          costCenterId: 'cc-1',
          attachedVersionId: 'v-1',
        },
      },
      slicesByCommitment: {
        'c-1': [
          {
            commitmentId: 'c-1',
            month: '2026-11-01',
            seatCount: 1,
            shareMinor: 500_000n,
            appliedMinor: 166_667n,
            releasedMinor: 333_333n,
            settledAt: null,
          },
        ],
      },
    });

    const res = await service.settleMonth(ORG, '2026-11-01', NOW);
    expect(res).toEqual({ settledSlices: 1, settledCommitments: 0, releasedMinor: 0n });
    expect(commitmentMonths.markSettled).toHaveBeenCalledWith(TX, 'c-1', '2026-11-01', NOW);
    expect(commitments.release).not.toHaveBeenCalled();
    expect(commitmentMonths.addReleased).not.toHaveBeenCalled();
  });

  it('F6(a,c) & Ca F: sweeps legacy K2 commitments across all prior years when ready or >= 02-01, leaving K1/K4 untouched', async () => {
    const commonHeld = {
      'c-k2': {
        id: 'c-k2',
        requestId: 'req-k2',
        year: 2026,
        amountMinor: 1_000_000n,
        releasedMinor: 0n,
        appliedMinor: 700_000n,
        currency: 'VND',
        state: 'HELD' as const,
        organizationId: ORG,
        costCenterId: 'cc-1',
        attachedVersionId: 'v-1',
      },
      'c-k1': {
        id: 'c-k1',
        requestId: 'req-k1',
        year: 2026,
        amountMinor: 1_000_000n,
        releasedMinor: 0n,
        appliedMinor: 0n,
        currency: 'VND',
        state: 'HELD' as const,
        organizationId: ORG,
        costCenterId: 'cc-1',
        attachedVersionId: 'v-1',
      },
    };
    // Before 02-01 and priorDecemberReady = false => does not sweep 2026
    const notReady = setup({
      heldYearsBefore: [2026],
      commitmentsById: commonHeld,
      heldByYear: { 2026: [commonHeld['c-k2'], commonHeld['c-k1']] },
      planKindByRequest: { 'req-k2': 'K2', 'req-k1': 'K1' },
    });
    const skippedRes = await notReady.service.runPass({
      organizationId: ORG,
      today: '2027-01-15',
      now: NOW,
      readyMonths: [],
      priorDecemberReady: false,
    });
    expect(skippedRes.sweptCommitments).toBe(0);
    expect(notReady.commitments.release).not.toHaveBeenCalled();

    // On 2027-02-01 (>= 02-01 fallback) => sweeps K2 (300k YEAR_END_SEAT_MONTHS) and leaves K1 alone
    const afterFeb1 = setup({
      heldYearsBefore: [2026],
      commitmentsById: commonHeld,
      heldByYear: { 2026: [commonHeld['c-k2'], commonHeld['c-k1']] },
      planKindByRequest: { 'req-k2': 'K2', 'req-k1': 'K1' },
    });
    const sweptRes = await afterFeb1.service.runPass({
      organizationId: ORG,
      today: '2027-02-01',
      now: new Date('2027-02-01T01:00:00.000Z'),
      readyMonths: [],
      priorDecemberReady: false,
    });
    expect(sweptRes.sweptCommitments).toBe(1);
    expect(sweptRes.releasedMinor).toBe(300_000n);
    expect(afterFeb1.commitments.release).toHaveBeenCalledTimes(1);
    expect(afterFeb1.commitments.release).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ id: 'c-k2' }),
      expect.objectContaining({
        takeMinor: 300_000n,
        reason: 'YEAR_END_SEAT_MONTHS',
        reasonText: 'year:2026',
      }),
    );
  });
});
