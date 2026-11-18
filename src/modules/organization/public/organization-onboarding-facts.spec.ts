import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CostCenterCatalogueService } from '../cost-center/cost-center-catalogue.service';
import { DepartmentRecordService } from '../department/department-record.service';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { OrganizationContextService } from '../organization-context.service';
import { OrganizationRepo } from '../organization.repo';
import { AnnouncementRepo } from '../change-announcement/announcement.repo';
import { OrganizationChangeService } from '../change-announcement/organization-change.service';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from './organization-read.api';
import { OrganizationChangeListeners } from './organization.extension-points';

/** With a transaction, every read behind the onboarding facts runs in it; without one, none is passed. */
describe('OrganizationReadApi.getOnboardingFacts', () => {
  const TX = { name: 'caller transaction' } as unknown as DbTx;

  function build() {
    const calls: { read: string; client: unknown }[] = [];
    const recorded =
      <T>(read: string, value: T) =>
      (...args: unknown[]) => {
        calls.push({ read, client: args[args.length - 1] });
        return Promise.resolve(value);
      };
    const repo = { findOrganization: jest.fn(recorded('findOrganization', { timeZone: 'Asia/Ho_Chi_Minh' })) };
    const departments = {
      countActive: jest.fn(recorded('countActive', 1)),
      activeWithoutHead: jest.fn(recorded('activeWithoutHead', [{ id: 'd-1', code: 'P', name: 'P' }])),
      activeWithItAdmin: jest.fn(recorded('activeWithItAdmin', [])),
    };
    // The Cost Center side of the facts: the departments with none yet (the link's activation is not read any more).
    const costCenters = {
      departmentsWithoutCostCenter: jest.fn(
        recorded('departmentsWithoutCostCenter', [{ id: 'd-1', code: 'P', name: 'P' }]),
      ),
    };
    const employees = { countActive: jest.fn(recorded('employeesCountActive', 2)) };
    const service = new OrganizationReadApi(
      repo as unknown as OrganizationRepo,
      departments as unknown as DepartmentRecordService,
      employees as unknown as EmployeeRecordService,
      costCenters as unknown as CostCenterCatalogueService,
      new OrganizationChangeService(new OrganizationChangeListeners(), {} as AnnouncementRepo, {} as TransactionRunner),
      new OrganizationContextService(repo as unknown as OrganizationRepo),
    );
    return { service, calls };
  }

  it('passes the caller transaction to the zone read and to each of the five fact reads', async () => {
    const { service, calls } = build();

    await expect(service.getOnboardingFacts(TX)).resolves.toMatchObject({
      activeDepartments: 1,
      activeEmployees: 2,
      departmentsWithoutCostCenter: [{ code: 'P', name: 'P' }],
      departmentsWithoutHead: [{ code: 'P', name: 'P' }],
    });
    expect(calls.map(({ read }) => read)).toEqual([
      'findOrganization',
      'countActive',
      'employeesCountActive',
      'departmentsWithoutCostCenter',
      'activeWithoutHead',
      'activeWithItAdmin',
    ]);
    expect(calls.filter(({ client }) => client !== TX)).toEqual([]);
  });

  it('does not say whether the Cost Center link was activated: the final code never reads it', async () => {
    const { service } = build();

    expect(Object.keys(await service.getOnboardingFacts()).sort()).toEqual([
      'activeDepartments',
      'activeEmployees',
      'departmentsByItAdmin',
      'departmentsWithoutCostCenter',
      'departmentsWithoutHead',
    ]);
  });

  it('passes no transaction for the onboarding checklist, which reads without one', async () => {
    const { service, calls } = build();

    await service.getOnboardingFacts();

    expect(calls.filter(({ client }) => client === TX)).toEqual([]);
  });
});
