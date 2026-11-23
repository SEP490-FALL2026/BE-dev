import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DepartmentHeadRepo } from './department-head.repo';

describe('DepartmentHeadRepo.headedDepartment', () => {
  it('queries tx when tx is provided instead of prisma', async () => {
    const prisma = { $queryRaw: jest.fn() };
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ department_id: 'dept-1' }]) };
    const repo = new DepartmentHeadRepo(prisma as unknown as PrismaService);

    const result = await repo.headedDepartment('emp-1', '2026-11-23', tx as unknown as DbTx);

    expect(result).toEqual({ departmentId: 'dept-1' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
