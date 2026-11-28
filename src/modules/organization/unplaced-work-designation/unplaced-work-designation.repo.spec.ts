import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { UnplacedWorkDesignationRepo } from './unplaced-work-designation.repo';

describe('UnplacedWorkDesignationRepo', () => {
  it('endActiveByWork scopes by employeeId when provided and leaves other employees designations open', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { unplacedWorkItDesignation: { updateMany } } as unknown as DbTx;
    const repo = new UnplacedWorkDesignationRepo({} as PrismaService);
    const endedAt = new Date('2026-11-24T10:00:00Z');

    const scoped = await repo.endActiveByWork(tx, {
      workKind: 'DEVICE',
      workId: 'dev-1',
      employeeId: 'emp-old',
      endedByAppUserId: 'app-user-1',
      endedAt,
    });
    expect(scoped).toBe(1);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { workKind: 'DEVICE', workId: 'dev-1', employeeId: 'emp-old', endedAt: null },
      data: { endedAt, endedByAppUserId: 'app-user-1', endCause: 'WORK_CLOSED' },
    });

    await repo.endActiveByWork(tx, {
      workKind: 'DEVICE',
      workId: 'dev-1',
      endedByAppUserId: 'app-user-1',
      endedAt,
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { workKind: 'DEVICE', workId: 'dev-1', endedAt: null },
      data: { endedAt, endedByAppUserId: 'app-user-1', endCause: 'WORK_CLOSED' },
    });
  });
});
