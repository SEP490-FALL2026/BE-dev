import type { AuditApi } from '../../audit/public/audit.api';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { BudgetFactsService } from '../budget/budget-facts.service';
import type { CommitmentRepo } from '../budget/commitment.repo';
import { CommitmentReleaseGuardHook, CommitmentRequestFactsHook } from '../public/budgets.extension-points';
import type { ThresholdAlertService } from '../threshold/threshold-alert.service';
import { CommitmentService } from './commitment.service';
import type { CommitmentMonthService } from './month/commitment-month.service';

const COST_CENTER = '0a1b2c3d-0000-4000-8000-000000000001';
const TX = {} as DbTx;
const NOW = new Date('2027-03-10T03:00:00.000Z');
const ACTOR = { employeeId: 'emp-1', roles: ['FINANCE'] } as never;

const commitmentRow = (index: number, state: 'HELD' | 'RELEASED' | 'EXPENSED' = 'HELD') => ({
  id: `c-${index}`,
  requestId: `req-${index}`,
  costCenterId: COST_CENTER,
  year: 2027,
  amountMinor: 1000n,
  releasedMinor: 0n,
  appliedMinor: 0n,
  currency: 'VND',
  state,
  attachedVersionId: 'v-1',
  attachedAt: new Date('2027-01-02T00:00:00.000Z'),
  unattachedReason: null,
  createdAt: new Date('2027-01-02T00:00:00.000Z'),
});

function makeMonthlyService(overrides: Record<string, unknown> = {}) {
  const commitments = {
    yearsHeldBy: jest.fn().mockResolvedValue([]),
    hold: jest.fn().mockResolvedValue([{ id: 'c-1', year: 2027, amountMinor: 1_000_000n, attachedVersionId: 'v-1' }]),
    requestsHoldingYear: jest.fn().mockResolvedValue(new Set()),
    holdYearStart: jest.fn().mockResolvedValue({
      id: 'c-ys',
      year: 2027,
      amountMinor: 6_000_000n,
      attachedVersionId: 'v-1',
      costCenterId: COST_CENTER,
    }),
    lockOfRequest: jest.fn().mockResolvedValue([]),
    lockById: jest.fn().mockResolvedValue(null),
    lockSeatCommitmentsWithIds: jest.fn().mockResolvedValue([]),
    releasedFor: jest.fn().mockResolvedValue(new Set()),
    release: jest.fn().mockResolvedValue({ released: false, heldMinor: 0n }),
    exists: jest.fn().mockResolvedValue(true),
    pageReleases: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    page: jest.fn().mockResolvedValue({ rows: [commitmentRow(1)], total: 1 }),
    invoiceFiguresOf: jest.fn().mockResolvedValue(new Map()),
    ...overrides,
  };
  const commitmentMonths = {
    insertMany: jest.fn().mockResolvedValue(undefined),
    lockOfCommitment: jest.fn().mockResolvedValue([]),
    addReleased: jest.fn().mockResolvedValue(undefined),
    ...(overrides.commitmentMonths as Record<string, unknown> | undefined),
  };
  const runner = {
    run: <T>(fn: (tx: DbTx) => Promise<T>) => fn(TX),
  } as unknown as TransactionRunner;
  const guard = new CommitmentReleaseGuardHook();
  guard.bind({ canReleaseRemainder: jest.fn().mockResolvedValue(true) });
  const facts = {
    today: jest.fn().mockResolvedValue('2027-03-10'),
    people: jest.fn().mockResolvedValue(new Map()),
    formatter: jest.fn().mockResolvedValue((minor: bigint) => ({ amount: minor.toString(), currency: 'VND' })),
    costCenters: jest
      .fn()
      .mockResolvedValue(new Map([[COST_CENTER, { id: COST_CENTER, code: 'ENG', name: 'Engineering' }]])),
  };
  const thresholds = {
    watch: jest.fn().mockResolvedValue(undefined),
    settle: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const reqFacts = new CommitmentRequestFactsHook();
  reqFacts.bind({ factsOf: jest.fn().mockResolvedValue(new Map()) });

  const service = new CommitmentService(
    runner,
    commitments as unknown as CommitmentRepo,
    facts as unknown as BudgetFactsService,
    audit as unknown as AuditApi,
    guard,
    reqFacts,
    commitmentMonths as unknown as CommitmentMonthService,
    thresholds as unknown as ThresholdAlertService,
  );

  return { service, commitments, commitmentMonths };
}

describe('CommitmentService monthly slices (W3-07)', () => {
  it('inserts monthly slice rows on hold when months are provided and skips for K1/K4 (months absent)', async () => {
    const { service, commitmentMonths } = makeMonthlyService();

    await service.hold(TX, ACTOR, {
      organizationId: 'org-1',
      requestId: 'req-1',
      costCenterId: COST_CENTER,
      snapshotCheckId: 'chk-1',
      currency: 'VND',
      now: NOW,
      items: [{ year: 2027, amountMinor: 1_000_000n }],
      seatMonthlyMinor: 500_000n,
      months: [
        { month: '2027-11-01', seatCount: 1 },
        { month: '2027-12-01', seatCount: 1 },
      ],
    });
    expect(commitmentMonths.insertMany).toHaveBeenCalledWith(TX, [
      { commitmentId: 'c-1', month: '2027-11-01', seatCount: 1, shareMinor: 500_000n },
      { commitmentId: 'c-1', month: '2027-12-01', seatCount: 1, shareMinor: 500_000n },
    ]);

    commitmentMonths.insertMany.mockClear();
    await service.hold(TX, ACTOR, {
      organizationId: 'org-1',
      requestId: 'req-2',
      costCenterId: COST_CENTER,
      snapshotCheckId: 'chk-1',
      currency: 'VND',
      now: NOW,
      items: [{ year: 2027, amountMinor: 1_000_000n }],
      seatMonthlyMinor: null,
    });
    expect(commitmentMonths.insertMany).not.toHaveBeenCalled();
  });

  it('F1: release with months records ONLY actual spread amount and skips 0đ release when months already settled', async () => {
    const lockOfCommitment = jest.fn().mockResolvedValue([
      {
        commitmentId: 'c-1',
        month: '2027-01-01',
        seatCount: 1,
        shareMinor: 500_000n,
        appliedMinor: 0n,
        releasedMinor: 500_000n,
        settledAt: NOW,
      },
      {
        commitmentId: 'c-1',
        month: '2027-02-01',
        seatCount: 1,
        shareMinor: 500_000n,
        appliedMinor: 0n,
        releasedMinor: 500_000n,
        settledAt: NOW,
      },
      {
        commitmentId: 'c-1',
        month: '2027-03-01',
        seatCount: 1,
        shareMinor: 500_000n,
        appliedMinor: 0n,
        releasedMinor: 0n,
        settledAt: null,
      },
    ]);
    const { service, commitments, commitmentMonths } = makeMonthlyService({
      lockOfRequest: jest.fn().mockResolvedValue([
        {
          id: 'c-1',
          year: 2027,
          amountMinor: 1_500_000n,
          releasedMinor: 1_000_000n,
          appliedMinor: 0n,
          state: 'HELD',
          organizationId: 'org-1',
          costCenterId: COST_CENTER,
          origin: 'YEAR_START',
          seatMonthlyMinor: 500_000n,
          attachedVersionId: 'v-1',
        },
      ]),
      release: jest.fn().mockResolvedValue({ released: false, heldMinor: 354_839n }),
      commitmentMonths: { lockOfCommitment },
    });

    const res = await service.release(TX, {
      requestId: 'req-1',
      reason: 'LATE_GRANT',
      reference: 'grantAssignment:a1',
      amounts: [
        {
          year: 2027,
          amountMinor: 1_145_161n,
          months: [
            { month: '2027-01-01', amountMinor: 500_000n },
            { month: '2027-02-01', amountMinor: 500_000n },
            { month: '2027-03-01', amountMinor: 145_161n },
          ],
        },
      ],
      now: NOW,
    });

    expect(commitmentMonths.addReleased).toHaveBeenCalledWith(TX, 'c-1', '2027-03-01', 145_161n);
    expect(commitments.release).toHaveBeenCalledWith(
      TX,
      expect.anything(),
      expect.objectContaining({ takeMinor: 145_161n }),
    );
    expect(res).toEqual([{ id: 'c-1', year: 2027, releasedMinor: 145_161n, heldMinor: 354_839n, released: false }]);

    commitments.release.mockClear();
    commitmentMonths.addReleased.mockClear();
    const zeroRes = await service.release(TX, {
      requestId: 'req-1',
      reason: 'LATE_GRANT',
      reference: 'grantAssignment:a2',
      amounts: [{ year: 2027, amountMinor: 500_000n, months: [{ month: '2027-01-01', amountMinor: 500_000n }] }],
      now: NOW,
    });
    expect(commitments.release).not.toHaveBeenCalled();
    expect(commitmentMonths.addReleased).not.toHaveBeenCalled();
    expect(zeroRes).toEqual([]);
  });

  it('Ca L: releaseRemainder spreads from last month backwards (12 -> 11) and preserves MONTH_END / YEAR_END_SEAT_MONTHS in pageReleases', async () => {
    const lockOfCommitment = jest.fn().mockResolvedValue([
      {
        commitmentId: 'c-1',
        month: '2027-11-01',
        seatCount: 1,
        shareMinor: 500_000n,
        appliedMinor: 0n,
        releasedMinor: 0n,
        settledAt: null,
      },
      {
        commitmentId: 'c-1',
        month: '2027-12-01',
        seatCount: 1,
        shareMinor: 500_000n,
        appliedMinor: 0n,
        releasedMinor: 0n,
        settledAt: null,
      },
    ]);
    const { service, commitments, commitmentMonths } = makeMonthlyService({
      lockById: jest.fn().mockResolvedValue({
        id: 'c-1',
        requestId: 'req-1',
        year: 2027,
        amountMinor: 1_000_000n,
        releasedMinor: 0n,
        appliedMinor: 0n,
        currency: 'VND',
        state: 'HELD',
        organizationId: 'org-1',
        costCenterId: COST_CENTER,
        attachedVersionId: 'v-1',
      }),
      pageReleases: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'rel-1',
            amountMinor: 50_000n,
            reason: 'MONTH_END',
            reasonText: 'month:2027-03-01',
            releasedByEmployeeId: null,
            releasedAt: NOW,
          },
          {
            id: 'rel-2',
            amountMinor: 300_000n,
            reason: 'YEAR_END_SEAT_MONTHS',
            reasonText: 'year:2026',
            releasedByEmployeeId: null,
            releasedAt: NOW,
          },
        ],
        total: 2,
      }),
      commitmentMonths: { lockOfCommitment },
    });

    await service.releaseRemainder(ACTOR, 'c-1', 'Not needed');
    expect(commitmentMonths.addReleased.mock.calls).toEqual([
      [TX, 'c-1', '2027-12-01', 500_000n],
      [TX, 'c-1', '2027-11-01', 500_000n],
    ]);
    expect(commitments.release).toHaveBeenCalledWith(
      TX,
      expect.anything(),
      expect.objectContaining({ takeMinor: 1_000_000n, reason: 'REMAINDER' }),
    );

    const releasesPage = await service.pageReleases('c-1', { page: 1, pageSize: 20 });
    expect(releasesPage.items.map((i) => i.reason)).toEqual(['MONTH_END', 'YEAR_END_SEAT_MONTHS']);
  });
});
