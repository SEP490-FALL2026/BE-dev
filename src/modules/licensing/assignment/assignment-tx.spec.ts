import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AssignmentRepo } from './assignment.repo';
import { AssignmentService } from './assignment.service';

describe('Assignment tx forwarding (pageHeldOfPlans)', () => {
  it('AssignmentService.pageHeldOfPlans forwards tx to businessToday and repo.pageHeldOfPlans', async () => {
    const tx = { name: 'tx' } as unknown as DbTx;
    const repo = {
      pageHeldOfPlans: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2026-11-23'),
    };
    const service = new AssignmentService(
      repo as unknown as AssignmentRepo,
      {} as never,
      organizationReads as unknown as OrganizationReadApi,
      {} as never,
      {} as AuditApi,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.pageHeldOfPlans('emp-1', ['plan-1'], { skip: 0, take: 1 }, tx);

    expect(organizationReads.businessToday).toHaveBeenCalledWith(expect.any(Date), tx);
    expect(repo.pageHeldOfPlans).toHaveBeenCalledWith('emp-1', ['plan-1'], '2026-11-23', 0, 1, tx);
  });

  it('AssignmentRepo.pageHeldOfPlans runs sequential findMany and count on tx without calling prisma.$transaction', async () => {
    const prisma = { $transaction: jest.fn() };
    const tx = {
      licenseAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const repo = new AssignmentRepo(prisma as unknown as PrismaService);

    const result = await repo.pageHeldOfPlans('emp-1', ['plan-1'], '2026-11-23', 0, 1, tx as unknown as DbTx);

    expect(result).toEqual({ items: [], total: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.licenseAssignment.findMany).toHaveBeenCalledTimes(1);
    expect(tx.licenseAssignment.count).toHaveBeenCalledTimes(1);
  });
});
