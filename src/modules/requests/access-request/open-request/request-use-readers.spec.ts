import {
  CostCenterUseContributions,
  DepartmentUseContributions,
} from '../../../organization/public/organization.extension-points';
import { CostCenterOpenRequestsReader } from './cost-center-open-requests.listener';
import { DepartmentOpenRequestsReader } from './department-open-requests.listener';
import type { RequestUseRepo } from './request-use.repo';

const A = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const B = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';

function fakes(use: { ids: string[]; total: number }) {
  const repo = {
    ofDepartment: jest.fn().mockResolvedValue(use),
    ofCostCenter: jest.fn().mockResolvedValue(use),
  };
  const departmentUse = new DepartmentUseContributions();
  const costCenterUse = new CostCenterUseContributions();

  return { repo, departmentUse, costCenterUse };
}

describe('the readers of the requests that keep a department or a Cost Center in use', () => {
  it('register themselves with the organization when the module starts, each for its own group', () => {
    const { repo, departmentUse, costCenterUse } = fakes({ ids: [], total: 0 });
    const department = new DepartmentOpenRequestsReader(repo as unknown as RequestUseRepo, departmentUse);
    const costCenter = new CostCenterOpenRequestsReader(repo as unknown as RequestUseRepo, costCenterUse);

    department.onModuleInit();
    costCenter.onModuleInit();

    expect(departmentUse.all()).toEqual([department]);
    expect(costCenterUse.all()).toEqual([costCenter]);
    expect([department.group, costCenter.group]).toEqual(['OPEN_WORK', 'REQUESTS']);
  });

  it('tell each request as an item of its kind with no label, and the exact total, in the transaction given', async () => {
    const { repo, departmentUse, costCenterUse } = fakes({ ids: [A, B], total: 5 });
    const tx = {} as never;
    const department = new DepartmentOpenRequestsReader(repo as unknown as RequestUseRepo, departmentUse);
    const costCenter = new CostCenterOpenRequestsReader(repo as unknown as RequestUseRepo, costCenterUse);

    const open = await department.read('dep-1', '2026-10-28', 2, tx);
    const charged = await costCenter.read('cc-1', 2, tx);

    const expected = {
      items: [
        { kind: 'ACCESS_REQUEST', id: A, label: null },
        { kind: 'ACCESS_REQUEST', id: B, label: null },
      ],
      total: 5,
    };
    expect(open).toEqual(expected);
    expect(charged).toEqual(expected);
    expect(repo.ofDepartment).toHaveBeenCalledWith('dep-1', 2, tx);
    expect(repo.ofCostCenter).toHaveBeenCalledWith('cc-1', 2, tx);
  });

  it('say nothing is left when there is nothing', async () => {
    const { repo, departmentUse } = fakes({ ids: [], total: 0 });
    const department = new DepartmentOpenRequestsReader(repo as unknown as RequestUseRepo, departmentUse);

    expect(await department.read('dep-1', '2026-10-28', 10)).toEqual({ items: [], total: 0 });
  });
});
