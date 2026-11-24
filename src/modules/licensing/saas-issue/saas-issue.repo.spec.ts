import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SaasIssueRepo } from './saas-issue.repo';

describe('SaasIssueRepo', () => {
  it('lists unassigned NEW issues with composite cursor pagination ordered by createdAt asc, id asc', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { saasIssue: { findMany } } as unknown as PrismaService;
    const repo = new SaasIssueRepo(prisma);

    await repo.listUnassigned(200);
    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: { state: 'NEW', assignedItAdminEmployeeId: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });

    const cursorDate = new Date('2026-11-02T08:00:00Z');
    await repo.listUnassigned(200, { createdAt: cursorDate, id: 'issue-200' });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: {
        state: 'NEW',
        assignedItAdminEmployeeId: null,
        OR: [{ createdAt: { gt: cursorDate } }, { createdAt: cursorDate, id: { gt: 'issue-200' } }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
  });
});
