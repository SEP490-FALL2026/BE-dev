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

const mkRow = (id: string, year: number, requestId: string) => ({
  id,
  requestId,
  year,
  amountMinor: 500_000n,
  releasedMinor: 0n,
  appliedMinor: 0n,
  currency: 'VND',
  state: 'HELD' as const,
  organizationId: ORG,
  costCenterId: 'cc-1',
  attachedVersionId: 'v-1',
});

const mkCandidate = (commitmentId: string, year: number, requestId: string) => ({
  commitmentId,
  requestId,
  costCenterId: 'cc-1',
  year,
  currency: 'VND',
  month: '2026-12-01',
  seatCount: 1,
  shareMinor: 500_000n,
  appliedMinor: 0n,
  releasedMinor: 0n,
  settledAt: null,
});

const mkSlice = (commitmentId: string) => ({
  commitmentId,
  month: '2026-12-01',
  seatCount: 1,
  shareMinor: 500_000n,
  appliedMinor: 0n,
  releasedMinor: 0n,
  settledAt: null,
});

function buildIsolationService(opts: {
  unsettledForMonth?: ReturnType<typeof mkCandidate>[];
  commitmentsById: Record<string, ReturnType<typeof mkRow>>;
  slicesByCommitment?: Record<string, ReturnType<typeof mkSlice>[]>;
  heldYearsBefore?: number[];
  heldByYear?: Record<number, ReturnType<typeof mkRow>[]>;
}) {
  const commitments = {
    lockById: jest.fn((_tx: unknown, id: string) => Promise.resolve(opts.commitmentsById[id] ?? null)),
    release: jest.fn().mockResolvedValue({ released: true, heldMinor: 0n }),
  };
  const budgetFacts = {
    listHeldYearsBefore: jest.fn().mockResolvedValue(opts.heldYearsBefore ?? []),
    listHeldByYear: jest.fn((_org: string, yr: number) => Promise.resolve(opts.heldByYear?.[yr] ?? [])),
  };
  const commitmentMonths = {
    lockOrganizationMonth: jest.fn().mockResolvedValue(undefined),
    listUnsettledForMonth: jest.fn().mockResolvedValue(opts.unsettledForMonth ?? []),
    lockOfCommitment: jest.fn((_tx: unknown, id: string) => Promise.resolve(opts.slicesByCommitment?.[id] ?? [])),
    addReleased: jest.fn().mockResolvedValue(undefined),
    markSettled: jest.fn().mockResolvedValue(undefined),
    listUnsettledYearsBefore: jest.fn().mockResolvedValue([]),
    listUnsettledMonthsInYear: jest.fn().mockResolvedValue([]),
  };
  const yearLock = { lock: jest.fn().mockResolvedValue(undefined) };
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
      Promise.resolve(planIds.map((pid) => ({ planId: pid, provisioningType: 'K2' }))),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const runnerRun = jest.fn(<T>(fn: (tx: DbTx) => Promise<T>) => fn(TX));
  const service = new CommitmentMonthSettlementService(
    { run: runnerRun } as unknown as TransactionRunner,
    commitments as unknown as CommitmentRepo,
    budgetFacts as unknown as BudgetFactsRepo,
    commitmentMonths as unknown as CommitmentMonthRepo,
    yearLock,
    audit as unknown as AuditApi,
    catalog as unknown as CatalogApi,
    requestFacts,
  );

  return { service, runnerRun, commitments };
}

describe('CommitmentMonthSettlementService isolation (FIX-B1 F3 / A-I3)', () => {
  it('settles each commitment in its own tx ordered by (year, id) and isolates CHECK errors', async () => {
    const ctx = buildIsolationService({
      unsettledForMonth: [
        mkCandidate('c-2', 2027, 'req-2'),
        mkCandidate('c-b', 2026, 'req-b'),
        mkCandidate('c-a', 2026, 'req-a'),
      ],
      commitmentsById: {
        'c-2': mkRow('c-2', 2027, 'req-2'),
        'c-b': mkRow('c-b', 2026, 'req-b'),
        'c-a': mkRow('c-a', 2026, 'req-a'),
      },
      slicesByCommitment: {
        'c-2': [mkSlice('c-2')],
        'c-b': [mkSlice('c-b')],
        'c-a': [mkSlice('c-a')],
      },
    });
    ctx.commitments.release.mockRejectedValueOnce(new Error('CHECK constraint failed on c-a'));

    const res = await ctx.service.settleMonth(ORG, '2026-12-01', NOW);

    expect(ctx.runnerRun).toHaveBeenCalledTimes(3);
    expect(ctx.commitments.lockById.mock.calls.map((call: unknown[]) => call[1])).toEqual(['c-a', 'c-b', 'c-2']);
    expect(res).toEqual({ settledSlices: 2, settledCommitments: 2, releasedMinor: 1_000_000n });

    const sweepCtx = buildIsolationService({
      heldYearsBefore: [2026],
      commitmentsById: {
        'c-2': mkRow('c-2', 2026, 'req-2'),
        'c-1': mkRow('c-1', 2026, 'req-1'),
      },
      heldByYear: {
        2026: [mkRow('c-2', 2026, 'req-2'), mkRow('c-1', 2026, 'req-1')],
      },
    });
    sweepCtx.commitments.release.mockRejectedValueOnce(new Error('CHECK constraint failed on c-1'));

    const passRes = await sweepCtx.service.runPass({
      organizationId: ORG,
      today: '2027-02-01',
      now: new Date('2027-02-01T01:00:00.000Z'),
      readyMonths: [],
      priorDecemberReady: false,
    });

    expect(sweepCtx.runnerRun).toHaveBeenCalledTimes(2);
    expect(sweepCtx.commitments.lockById.mock.calls.map((call: unknown[]) => call[1])).toEqual(['c-1', 'c-2']);
    expect(passRes.sweptCommitments).toBe(1);
    expect(passRes.releasedMinor).toBe(500_000n);
  });
});
