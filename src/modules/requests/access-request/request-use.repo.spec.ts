import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { RequestUseRepo } from './request-use.repo';

/**
 * What keeps a department and a Cost Center in use (`QĐ-90e`, `QĐ-87d(2)`, F15, F16, F91): a department by every request not over, a Cost
 * Center only by a request with a cost. A free internal request carries the Cost Center of its department but charges nothing.
 */
describe('RequestUseRepo', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const repo = new RequestUseRepo({ accessRequest: { findMany, count } } as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    findMany.mockResolvedValue([{ id: 'r-1' }]);
    count.mockResolvedValue(1);
  });

  it('leaves the free internal requests out of what keeps a Cost Center in use, in the ids and in the count', async () => {
    const use = await repo.ofCostCenter('cc-1', 5);

    const where = { costCenterId: 'cc-1', state: expect.anything() as unknown, branch: { not: 'INTERNAL_FREE' } };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, take: 5 }));
    expect(count).toHaveBeenCalledWith({ where });
    expect(use).toEqual({ ids: ['r-1'], total: 1 });
  });

  it('keeps every request not over in the use of a department, free or not', async () => {
    await repo.ofDepartment('d-1', 5);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentId: 'd-1', state: expect.anything() as unknown } }),
    );
  });
});
