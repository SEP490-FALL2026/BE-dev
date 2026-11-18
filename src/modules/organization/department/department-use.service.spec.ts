import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  CostCenterUseContributions,
  DepartmentUseContributions,
  type CostCenterUseReader,
  type DepartmentUseReader,
} from '../public/organization.extension-points';
import type { UseGroup, UseItem } from '../public/organization-use.types';
import { UseReaderMissingError } from './department.errors';
import { DepartmentUseService } from './department-use.service';

const item = (kind: string, id: string): UseItem => ({ kind, id, label: null });
const group = (items: UseItem[], total = items.length): UseGroup => ({ items, total });

describe('DepartmentUseService (what keeps a department or a Cost Center in use, QĐ-90e, QĐ-87d(2), F15, F16)', () => {
  const tx = { name: 'tx' } as unknown as DbTx;

  const departmentReader = (name: DepartmentUseReader['group'], answer: UseGroup) => {
    const read = jest.fn<ReturnType<DepartmentUseReader['read']>, Parameters<DepartmentUseReader['read']>>(() =>
      Promise.resolve(answer),
    );
    const reader: DepartmentUseReader = { group: name, read };

    return { reader, read };
  };
  /** The service over readers added in this order, as the modules that hold the facts add them when they start. */
  const serviceWith = (departments: DepartmentUseReader[], costCenters: CostCenterUseReader[] = []) => {
    const departmentReaders = new DepartmentUseContributions();
    const costCenterReaders = new CostCenterUseContributions();
    departments.forEach((reader, index) => departmentReaders.add(`department-${index}`, reader));
    costCenters.forEach((reader, index) => costCenterReaders.add(`cost-center-${index}`, reader));

    return new DepartmentUseService(departmentReaders, costCenterReaders);
  };
  const costCenterReader = (name: CostCenterUseReader['group'], answer: UseGroup) => {
    const read = jest.fn<ReturnType<CostCenterUseReader['read']>, Parameters<CostCenterUseReader['read']>>(() =>
      Promise.resolve(answer),
    );
    const reader: CostCenterUseReader = { group: name, read };

    return { reader, read };
  };

  describe('a department', () => {
    it('asks the reader of each group in the caller transaction, with the day and the limit', async () => {
      const work = departmentReader('OPEN_WORK', group([item('ACCESS_REQUEST', 'r-1')]));
      const subscriptions = departmentReader('SUBSCRIPTIONS', group([]));
      const service = serviceWith([work.reader, subscriptions.reader]);

      const use = await service.readDepartment('dep-1', '2026-10-28', 20, tx);

      expect(use).toEqual({ openWork: group([item('ACCESS_REQUEST', 'r-1')]), subscriptions: group([]) });
      expect(work.read).toHaveBeenCalledWith('dep-1', '2026-10-28', 20, tx);
      expect(subscriptions.read).toHaveBeenCalledWith('dep-1', '2026-10-28', 20, tx);
    });

    it('merges several readers of one group in the order they registered, cuts the items at the limit and adds the totals', async () => {
      const service = serviceWith([
        departmentReader('OPEN_WORK', group([item('ACCESS_REQUEST', 'r-1')], 5)).reader,
        departmentReader('OPEN_WORK', group([item('TRANSFER', 't-1'), item('TRANSFER', 't-2')], 2)).reader,
        departmentReader('SUBSCRIPTIONS', group([])).reader,
      ]);

      const { openWork } = await service.readDepartment('dep-1', '2026-10-28', 2);

      expect(openWork).toEqual(group([item('ACCESS_REQUEST', 'r-1'), item('TRANSFER', 't-1')], 7));
    });

    it('fails loudly when no module reads a group, rather than letting a retirement pass what it cannot see', async () => {
      const service = serviceWith([departmentReader('OPEN_WORK', group([])).reader]);

      await expect(service.readDepartment('dep-1', '2026-10-28', 20)).rejects.toThrow(UseReaderMissingError);
      await expect(service.readDepartment('dep-1', '2026-10-28', 20)).rejects.toMatchObject({
        group: 'SUBSCRIPTIONS',
      });
    });

    it('fails loudly when nobody registered anything', async () => {
      await expect(serviceWith([]).readDepartment('dep-1', '2026-10-28', 20)).rejects.toMatchObject({
        group: 'OPEN_WORK',
      });
    });
  });

  describe('a Cost Center', () => {
    it('asks the reader of each group and keeps the groups apart', async () => {
      const requests = costCenterReader('REQUESTS', group([item('ACCESS_REQUEST', 'r-1')]));
      const commitments = costCenterReader('COMMITMENTS', group([item('BUDGET_COMMITMENT', 'c-1')], 3));
      const service = serviceWith([], [requests.reader, commitments.reader]);

      const use = await service.readCostCenter('cc-1', 20, tx);

      expect(use).toEqual({
        requests: group([item('ACCESS_REQUEST', 'r-1')]),
        commitments: group([item('BUDGET_COMMITMENT', 'c-1')], 3),
      });
      expect(requests.read).toHaveBeenCalledWith('cc-1', 20, tx);
      expect(commitments.read).toHaveBeenCalledWith('cc-1', 20, tx);
    });

    it('fails loudly when no module reads a group', async () => {
      const service = serviceWith([], [costCenterReader('REQUESTS', group([])).reader]);

      await expect(service.readCostCenter('cc-1', 20)).rejects.toMatchObject({ group: 'COMMITMENTS' });
    });

    it('keeps what a department reader says out of a Cost Center answer', async () => {
      const service = serviceWith([departmentReader('OPEN_WORK', group([item('ACCESS_REQUEST', 'r-1')])).reader]);

      await expect(service.readCostCenter('cc-1', 20)).rejects.toBeInstanceOf(UseReaderMissingError);
    });
  });
});
