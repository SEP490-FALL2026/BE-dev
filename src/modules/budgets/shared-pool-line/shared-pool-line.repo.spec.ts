import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SharedPoolLineRepo } from './shared-pool-line.repo';

describe('SharedPoolLineRepo', () => {
  const build = () => {
    const queryRaw = jest.fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>(() => Promise.resolve([]));
    const findManyRuns = jest.fn().mockResolvedValue([]);
    const prisma = {
      $queryRaw: queryRaw,
      seatMonthRun: { findMany: findManyRuns },
    } as unknown as PrismaService;
    const tx = {
      $queryRaw: queryRaw,
      seatMonthRun: { findMany: findManyRuns },
    } as unknown as DbTx;

    return { repo: new SharedPoolLineRepo(prisma), tx, queryRaw, findManyRuns };
  };

  it('aggregates invoice pool variances and in-review variances by month', async () => {
    const { repo, tx, queryRaw } = build();
    queryRaw.mockResolvedValueOnce([
      { month: '2027-01-01', variance: '250000', variance_in_review: '100000' },
      { month: '2027-02-01', variance: '-50000', variance_in_review: '0' },
    ]);

    const rows = await repo.invoiceVariancesByMonth(
      { organizationId: 'org-1', from: '2027-01-01', until: '2027-04-01' },
      tx,
    );

    expect(rows).toEqual([
      { month: '2027-01-01', varianceMinor: 250_000n, varianceInReviewMinor: 100_000n },
      { month: '2027-02-01', varianceMinor: -50_000n, varianceInReviewMinor: 0n },
    ]);
    const sql = queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain('invoice_pool_variance_resolutions');
    expect(sql).toContain('FILTER (WHERE NOT (i.pool_variance_in_review AND r.invoice_id IS NULL))');
    expect(queryRaw.mock.calls[0].slice(1)).toEqual(['org-1', '2027-01-01', '2027-04-01']);
  });

  it('sums invoice pool variances across a range with zero fallback', async () => {
    const { repo, queryRaw } = build();
    queryRaw.mockResolvedValueOnce([{ variance: '200000', variance_in_review: '-30000' }]);

    expect(
      await repo.invoiceVariancesTotals({ organizationId: 'org-1', from: '2027-01-01', until: '2027-04-01' }),
    ).toEqual({
      varianceMinor: 200_000n,
      varianceInReviewMinor: -30_000n,
    });
  });

  it('lists distinct subscriptionIds with seat_month_runs for one month or a range', async () => {
    const { repo, findManyRuns } = build();
    findManyRuns
      .mockResolvedValueOnce([{ subscriptionId: 'sub-1' }, { subscriptionId: 'sub-2' }])
      .mockResolvedValueOnce([
        { subscriptionId: 'sub-1', month: new Date('2027-01-01T00:00:00.000Z') },
        { subscriptionId: 'sub-2', month: new Date('2027-02-01T00:00:00.000Z') },
      ]);

    expect(await repo.subscriptionIdsWithRunsForMonth('org-1', '2027-01-01')).toEqual(['sub-1', 'sub-2']);
    expect(
      await repo.subscriptionIdsWithRunsByMonth({ organizationId: 'org-1', from: '2027-01-01', until: '2027-03-01' }),
    ).toEqual([
      { subscriptionId: 'sub-1', month: '2027-01-01' },
      { subscriptionId: 'sub-2', month: '2027-02-01' },
    ]);
  });

  it('reads seat-month totals grouped by subscription and month', async () => {
    const { repo, queryRaw } = build();
    queryRaw.mockResolvedValueOnce([
      { subscription_id: 'sub-1', month: '2027-01-01', amount_minor: '900000', applied_minor: '500000' },
    ]);

    expect(
      await repo.seatMonthTotalsBySubscriptionMonth({
        organizationId: 'org-1',
        from: '2027-01-01',
        until: '2027-02-01',
      }),
    ).toEqual([{ subscriptionId: 'sub-1', month: '2027-01-01', amountMinor: 900_000n, appliedMinor: 500_000n }]);
  });

  it('aggregates invoice pool variances by subscription for a month', async () => {
    const { repo, queryRaw } = build();
    queryRaw.mockResolvedValueOnce([{ subscription_id: 'sub-1', variance: '150000', variance_in_review: '50000' }]);

    expect(await repo.invoiceVariancesBySubscriptionMonth('org-1', '2027-01-01')).toEqual([
      { subscriptionId: 'sub-1', varianceMinor: 150_000n, varianceInReviewMinor: 50_000n },
    ]);
  });
});
