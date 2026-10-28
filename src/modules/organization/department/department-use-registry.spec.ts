import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CostCenterUseReader, DepartmentUseReader, UseGroup, UseItem } from '../organization-use.types';
import { DepartmentUseRegistry, UseReaderNotRegisteredError } from './department-use-registry';

const item = (kind: string, id: string): UseItem => ({ kind, id, label: null });
const group = (items: UseItem[], total = items.length): UseGroup => ({ items, total });

describe('DepartmentUseRegistry (what keeps a department or a Cost Center in use, QĐ-90e, QĐ-87d(2), F15, F16)', () => {
  const tx = { name: 'tx' } as unknown as DbTx;

  const departmentReader = (name: DepartmentUseReader['group'], answer: UseGroup) => {
    const read = jest.fn<ReturnType<DepartmentUseReader['read']>, Parameters<DepartmentUseReader['read']>>(() =>
      Promise.resolve(answer),
    );
    const reader: DepartmentUseReader = { group: name, read };

    return { reader, read };
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
      const registry = new DepartmentUseRegistry();
      const work = departmentReader('OPEN_WORK', group([item('ACCESS_REQUEST', 'r-1')]));
      const subscriptions = departmentReader('SUBSCRIPTIONS', group([]));
      registry.registerDepartment(work.reader);
      registry.registerDepartment(subscriptions.reader);

      const use = await registry.readDepartment('dep-1', '2026-10-28', 20, tx);

      expect(use).toEqual({ openWork: group([item('ACCESS_REQUEST', 'r-1')]), subscriptions: group([]) });
      expect(work.read).toHaveBeenCalledWith('dep-1', '2026-10-28', 20, tx);
      expect(subscriptions.read).toHaveBeenCalledWith('dep-1', '2026-10-28', 20, tx);
    });

    it('merges several readers of one group in the order they registered, cuts the items at the limit and adds the totals', async () => {
      const registry = new DepartmentUseRegistry();
      registry.registerDepartment(departmentReader('OPEN_WORK', group([item('ACCESS_REQUEST', 'r-1')], 5)).reader);
      registry.registerDepartment(
        departmentReader('OPEN_WORK', group([item('TRANSFER', 't-1'), item('TRANSFER', 't-2')], 2)).reader,
      );
      registry.registerDepartment(departmentReader('SUBSCRIPTIONS', group([])).reader);

      const { openWork } = await registry.readDepartment('dep-1', '2026-10-28', 2);

      expect(openWork).toEqual(group([item('ACCESS_REQUEST', 'r-1'), item('TRANSFER', 't-1')], 7));
    });

    it('fails loudly when no module reads a group, rather than letting a retirement pass what it cannot see', async () => {
      const registry = new DepartmentUseRegistry();
      registry.registerDepartment(departmentReader('OPEN_WORK', group([])).reader);

      await expect(registry.readDepartment('dep-1', '2026-10-28', 20)).rejects.toThrow(UseReaderNotRegisteredError);
      await expect(registry.readDepartment('dep-1', '2026-10-28', 20)).rejects.toMatchObject({
        group: 'SUBSCRIPTIONS',
      });
    });

    it('fails loudly when nobody registered anything', async () => {
      await expect(new DepartmentUseRegistry().readDepartment('dep-1', '2026-10-28', 20)).rejects.toMatchObject({
        group: 'OPEN_WORK',
      });
    });
  });

  describe('a Cost Center', () => {
    it('asks the reader of each group and keeps the groups apart', async () => {
      const registry = new DepartmentUseRegistry();
      const requests = costCenterReader('REQUESTS', group([item('ACCESS_REQUEST', 'r-1')]));
      const commitments = costCenterReader('COMMITMENTS', group([item('BUDGET_COMMITMENT', 'c-1')], 3));
      registry.registerCostCenter(requests.reader);
      registry.registerCostCenter(commitments.reader);

      const use = await registry.readCostCenter('cc-1', 20, tx);

      expect(use).toEqual({
        requests: group([item('ACCESS_REQUEST', 'r-1')]),
        commitments: group([item('BUDGET_COMMITMENT', 'c-1')], 3),
      });
      expect(requests.read).toHaveBeenCalledWith('cc-1', 20, tx);
      expect(commitments.read).toHaveBeenCalledWith('cc-1', 20, tx);
    });

    it('fails loudly when no module reads a group', async () => {
      const registry = new DepartmentUseRegistry();
      registry.registerCostCenter(costCenterReader('REQUESTS', group([])).reader);

      await expect(registry.readCostCenter('cc-1', 20)).rejects.toMatchObject({ group: 'COMMITMENTS' });
    });

    it('keeps what a department reader says out of a Cost Center answer', async () => {
      const registry = new DepartmentUseRegistry();
      registry.registerDepartment(departmentReader('OPEN_WORK', group([item('ACCESS_REQUEST', 'r-1')])).reader);

      await expect(registry.readCostCenter('cc-1', 20)).rejects.toBeInstanceOf(UseReaderNotRegisteredError);
    });
  });
});
