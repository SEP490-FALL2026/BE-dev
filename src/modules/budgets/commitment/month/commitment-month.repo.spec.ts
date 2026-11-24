import type { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CommitmentMonthRepo } from './commitment-month.repo';

describe('CommitmentMonthRepo', () => {
  const buildTx = () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const update = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([
      {
        commitmentId: 'c-1',
        month: new Date('2027-03-01T00:00:00.000Z'),
        seatCount: 4,
        shareMinor: 400_000n,
        appliedMinor: 100_000n,
        releasedMinor: 50_000n,
        settledAt: null,
      },
    ]);
    const executeRaw = jest.fn().mockResolvedValue(1);
    const queryRawCalls: { sql: string; values: unknown[] }[] = [];
    const queryRaw = jest.fn((strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
      queryRawCalls.push({ sql: strings.join('?'), values });
      return Promise.resolve([]);
    });

    const tx = {
      budgetCommitmentMonth: { createMany, update, findMany },
      $executeRaw: executeRaw,
      $queryRaw: queryRaw,
    } as unknown as DbTx;

    return {
      repo: new CommitmentMonthRepo({} as PrismaService),
      tx,
      createMany,
      update,
      findMany,
      executeRaw,
      queryRaw,
      queryRawCalls,
    };
  };

  it('inserts commitment month rows with Date columns and skips empty batches', async () => {
    const { repo, tx, createMany } = buildTx();

    await repo.insertMany(tx, []);
    expect(createMany).not.toHaveBeenCalled();

    await repo.insertMany(tx, [
      { commitmentId: 'c-1', month: '2027-03-01', seatCount: 3, shareMinor: 300_000n },
      { commitmentId: 'c-1', month: '2027-04-01', seatCount: 3, shareMinor: 300_000n },
    ]);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        { commitmentId: 'c-1', month: new Date('2027-03-01T00:00:00.000Z'), seatCount: 3, shareMinor: 300_000n },
        { commitmentId: 'c-1', month: new Date('2027-04-01T00:00:00.000Z'), seatCount: 3, shareMinor: 300_000n },
      ],
    });
  });

  it('acquires the Tier 0 advisory lock for (organizationId, month)', async () => {
    const { repo, tx, executeRaw } = buildTx();

    await repo.lockOrganizationMonth(tx, 'org-1', '2027-03-01');

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [strings, key] = executeRaw.mock.calls[0] as [TemplateStringsArray, unknown];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock');
    expect(key).toBe('commitment-month:org-1:2027-03-01');
  });

  it('deduplicates and sorts (commitmentId, month) pairs before locking rows FOR UPDATE', async () => {
    const { repo, tx, queryRawCalls } = buildTx();

    expect(await repo.lockByCommitmentAndMonths(tx, [])).toEqual([]);
    expect(queryRawCalls).toHaveLength(0);

    await repo.lockByCommitmentAndMonths(tx, [
      { commitmentId: 'c-2', month: '2027-02-01' },
      { commitmentId: 'c-1', month: '2027-04-01' },
      { commitmentId: 'c-1', month: '2027-03-01' },
      { commitmentId: 'c-1', month: '2027-04-01' },
    ]);

    expect(queryRawCalls).toHaveLength(1);
    expect(queryRawCalls[0].sql).toContain('ORDER BY m.commitment_id ASC, m.month ASC');
    expect(queryRawCalls[0].sql).toContain('FOR UPDATE');
    expect(queryRawCalls[0].values).toEqual([
      ['c-1', 'c-1', 'c-2'],
      ['2027-03-01', '2027-04-01', '2027-02-01'],
    ]);
  });

  it('applies, reverses, releases, marks settled, and clears settled_at cleanly', async () => {
    const { repo, tx, update } = buildTx();
    const settledAt = new Date('2027-04-02T00:00:00.000Z');
    const where = { commitmentId_month: { commitmentId: 'c-1', month: new Date('2027-03-01T00:00:00.000Z') } };

    await repo.addApplied(tx, 'c-1', '2027-03-01', 0n);
    expect(update).not.toHaveBeenCalled();

    await repo.addApplied(tx, 'c-1', '2027-03-01', 120_000n);
    expect(update).toHaveBeenLastCalledWith({ where, data: { appliedMinor: { increment: 120_000n } } });

    await repo.reverseApplied(tx, 'c-1', '2027-03-01', 50_000n);
    expect(update).toHaveBeenLastCalledWith({
      where,
      data: { appliedMinor: { decrement: 50_000n }, settledAt: null },
    });

    await repo.addReleased(tx, 'c-1', '2027-03-01', 30_000n, settledAt);
    expect(update).toHaveBeenLastCalledWith({
      where,
      data: { releasedMinor: { increment: 30_000n }, settledAt },
    });

    await repo.markSettled(tx, 'c-1', '2027-03-01', settledAt);
    expect(update).toHaveBeenLastCalledWith({ where, data: { settledAt } });

    await repo.clearSettled(tx, 'c-1', '2027-03-01');
    expect(update).toHaveBeenLastCalledWith({ where, data: { settledAt: null } });
  });

  it('lists unsettled commitments for a month and counts held commitments/months by year', async () => {
    const { repo, tx, queryRaw, queryRawCalls } = buildTx();
    queryRaw
      .mockResolvedValueOnce([
        {
          commitment_id: 'c-1',
          request_id: 'r-1',
          cost_center_id: 'cc-1',
          year: 2027,
          currency: 'VND',
          month: '2027-03-01',
          seat_count: 2,
          share_minor: '200000',
          applied_minor: '150000',
          released_minor: '0',
          settled_at: null,
        },
      ])
      .mockResolvedValueOnce([{ commitments: '2', months: '6', unsettled_months: '3' }]);

    const unsettled = await repo.listUnsettledForMonth('org-1', '2027-03-01', tx);
    expect(unsettled).toEqual([
      {
        commitmentId: 'c-1',
        requestId: 'r-1',
        costCenterId: 'cc-1',
        year: 2027,
        currency: 'VND',
        month: '2027-03-01',
        seatCount: 2,
        shareMinor: 200_000n,
        appliedMinor: 150_000n,
        releasedMinor: 0n,
        settledAt: null,
      },
    ]);
    expect(queryRawCalls).toHaveLength(0);

    const counts = await repo.countHeldByYear('org-1', 2027, tx);
    expect(counts).toEqual({ commitments: 2, months: 6, unsettledMonths: 3 });
  });
});
