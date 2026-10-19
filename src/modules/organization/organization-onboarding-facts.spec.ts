import { DbTx } from '../../infrastructure/database/transaction-runner';
import { CostCenterCatalogueService } from './cost-center/cost-center-catalogue.service';
import { DepartmentDirectoryService } from './department/department-directory.service';
import { EmployeeDirectoryService } from './employee/employee-directory.service';
import { JobTitleCatalogueService } from './job-title/job-title-catalogue.service';
import { OrganizationRepo } from './organization.repo';
import { OrganizationService } from './organization.service';

/** P23-RV-02: with a transaction, every read behind the onboarding facts runs in it; without one, none is passed. */
describe('OrganizationService.getOnboardingFacts', () => {
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
    const employees = { countActive: jest.fn(recorded('employeesCountActive', 2)) };
    const costCenters = { countFreeUnits: jest.fn(recorded('countFreeUnits', 0)) };
    const service = new OrganizationService(
      repo as unknown as OrganizationRepo,
      departments as unknown as DepartmentDirectoryService,
      employees as unknown as EmployeeDirectoryService,
      costCenters as unknown as CostCenterCatalogueService,
      {} as JobTitleCatalogueService,
    );
    return { service, calls };
  }

  it('passes the caller transaction to the zone read and to each of the five fact reads', async () => {
    const { service, calls } = build();

    await expect(service.getOnboardingFacts(TX)).resolves.toMatchObject({
      activeDepartments: 1,
      activeEmployees: 2,
      departmentsWithoutHead: [{ code: 'P', name: 'P' }],
    });
    expect(calls.map(({ read }) => read)).toEqual([
      'findOrganization',
      'countActive',
      'employeesCountActive',
      'countFreeUnits',
      'activeWithoutHead',
      'activeWithItAdmin',
    ]);
    expect(calls.filter(({ client }) => client !== TX)).toEqual([]);
  });

  it('passes no transaction for the onboarding checklist, which reads without one', async () => {
    const { service, calls } = build();

    await service.getOnboardingFacts();

    expect(calls.filter(({ client }) => client === TX)).toEqual([]);
  });
});
