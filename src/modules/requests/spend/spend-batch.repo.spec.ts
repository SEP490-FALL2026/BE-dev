import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SpendBatchRepo } from './spend-batch.repo';

/** The one database call of `pageItems`, answered with the items as the table holds them. */
function repoWith(stored: { requestId: string; position: number; outcome: string; stopReason: string | null }[]) {
  const rows = stored.map((item) => ({ ...item, leftReason: null, leftAt: null }));
  const prisma = {
    spendBatchItem: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([rows, rows.length]),
  };

  return new SpendBatchRepo(prisma as unknown as PrismaService);
}

describe('QĐ-111an, R-4: the items of a batch an older release made are read with the reasons that exist now', () => {
  it('reads a request that stopped for want of a rate as the missing price it comes to, and leaves the other reasons as they were', async () => {
    const repo = repoWith([
      { requestId: 'r-1', position: 1, outcome: 'STOPPED', stopReason: 'RATE_MISSING' },
      { requestId: 'r-2', position: 2, outcome: 'STOPPED', stopReason: 'PRICE_MISSING' },
      { requestId: 'r-3', position: 3, outcome: 'STOPPED', stopReason: 'OVER_RESERVE' },
      { requestId: 'r-4', position: 4, outcome: 'SENT_TO_APPROVER', stopReason: null },
    ]);

    const page = await repo.pageItems('batch-1', 0, 20);

    expect(page.items.map((item) => item.stopReason)).toEqual(['PRICE_MISSING', 'PRICE_MISSING', 'OVER_RESERVE', null]);
  });
});
