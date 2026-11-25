import { toDateColumn } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SharedPoolAvoidedCostRepo } from './shared-pool-avoided-cost.repo';

describe('SharedPoolAvoidedCostRepo (FIX-B1 F10 / B M6)', () => {
  it('records recordedOn equal to completedOn instead of assignment.validFrom', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest.fn().mockResolvedValue({
      id: 'task-1',
      organizationId: 'org-1',
      assignmentId: 'asg-1',
      requestId: 'req-1',
      assignment: {
        planId: 'plan-1',
        validFrom: toDateColumn('2027-01-01'),
        plan: { provisioningType: 'K2' },
      },
    });
    const tx = {
      provisioningTask: { findUnique },
      poolGrantAvoidedCost: { createMany },
    } as unknown as DbTx;

    const repo = new SharedPoolAvoidedCostRepo();
    await repo.recordForTask(tx, 'task-1', { amountMinor: 6_000_000n, currency: 'VND' }, '2027-01-15');

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          provisioningTaskId: 'task-1',
          recordedOn: toDateColumn('2027-01-15'),
        }),
      ],
      skipDuplicates: true,
    });
  });
});
