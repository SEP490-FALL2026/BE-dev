import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OrganizationChangeService } from '../change-announcement/organization-change.service';
import type { CostCenterCatalogueService } from '../cost-center/cost-center-catalogue.service';
import type { DepartmentRecordService } from '../department/department-record.service';
import type { EmployeeRecordService } from '../employee/employee-record.service';
import type { OrganizationContextService } from '../organization-context.service';
import type { OrganizationRepo } from '../organization.repo';
import { OrganizationReadApi } from './organization-read.api';

describe('OrganizationReadApi tx forwarding', () => {
  const tx = { name: 'tx' } as unknown as DbTx;

  const makeApi = () => {
    const departments = {
      hasHeadPeriodFrom: jest.fn().mockResolvedValue(true),
      headedDepartment: jest.fn().mockResolvedValue({ departmentId: 'dept-1' }),
    };
    const context = {
      businessToday: jest.fn().mockResolvedValue('2026-11-23'),
    };
    const api = new OrganizationReadApi(
      {} as OrganizationRepo,
      departments as unknown as DepartmentRecordService,
      {} as EmployeeRecordService,
      {} as CostCenterCatalogueService,
      {} as OrganizationChangeService,
      context as unknown as OrganizationContextService,
    );

    return { api, departments, context };
  };

  it('forwards tx in isDepartmentHead to businessToday and hasHeadPeriodFrom', async () => {
    const { api, departments, context } = makeApi();

    const result = await api.isDepartmentHead('emp-1', tx);

    expect(result).toBe(true);
    expect(context.businessToday).toHaveBeenCalledWith(expect.any(Date), tx);
    expect(departments.hasHeadPeriodFrom).toHaveBeenCalledWith(tx, 'emp-1', '2026-11-23');
  });

  it('forwards tx in getHeadedDepartment to businessToday and headedDepartment', async () => {
    const { api, departments, context } = makeApi();

    const result = await api.getHeadedDepartment('emp-1', undefined, tx);

    expect(result).toEqual({ departmentId: 'dept-1' });
    expect(context.businessToday).toHaveBeenCalledWith(expect.any(Date), tx);
    expect(departments.headedDepartment).toHaveBeenCalledWith('emp-1', '2026-11-23', tx);
  });
});
