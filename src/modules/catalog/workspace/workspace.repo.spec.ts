import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { WorkspaceRepo } from './workspace.repo';

describe('WorkspaceRepo', () => {
  describe('subscriptionCountsOf', () => {
    it('returns an empty map without querying when no workspace ids are given', async () => {
      const prisma = { $queryRaw: jest.fn() } as unknown as PrismaService;
      const repo = new WorkspaceRepo(prisma);

      const counts = await repo.subscriptionCountsOf([], '2026-12-09');

      expect(counts.size).toBe(0);
      expect((prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw).not.toHaveBeenCalled();
    });

    it('counts live (unclosed, unrenewed, unexpired or draft) subscriptions per workspace and defaults missing ids to 0', async () => {
      const queryRaw = jest.fn().mockResolvedValue([{ workspace_id: 'ws-1', total: 2 }]);
      const tx = { $queryRaw: queryRaw } as unknown as DbTx;
      const repo = new WorkspaceRepo({} as PrismaService);

      const counts = await repo.subscriptionCountsOf(['ws-1', 'ws-2'], '2026-12-09', tx);

      expect(counts).toEqual(
        new Map([
          ['ws-1', 2],
          ['ws-2', 0],
        ]),
      );
      expect(queryRaw).toHaveBeenCalledTimes(1);
      const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
      const sql = strings.join(' ');
      expect(sql).toContain('closed_at IS NULL');
      expect(sql).toContain('renewed_from_id');
      expect(sql).toContain('end_date');
      expect(values).toContain('2026-12-09');
    });
  });
});
