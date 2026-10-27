import { DbTx } from '../../infrastructure/database/transaction-runner';
import { CostCenterCatalogueService } from './cost-center/cost-center-catalogue.service';
import { DepartmentDirectoryService } from './department/department-directory.service';
import { EmployeeDirectoryService } from './employee/employee-directory.service';
import { OrganizationRepo } from './organization.repo';
import { DepartmentServiceAccountRegistry } from './department/service-account-registry';
import { AnnouncementRepo } from './change-announcement/announcement.repo';
import { OrganizationChangeRegistry } from './change-announcement/organization-change.registry';
import { OrganizationChangeService } from './change-announcement/organization-change.service';
import type { TransactionRunner } from '../../infrastructure/database/transaction-runner';
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
    // The Cost Center side of the facts: the departments with none yet, and whether the link is activated.
    const costCenters = {
      departmentsWithoutCostCenter: jest.fn(
        recorded('departmentsWithoutCostCenter', [{ id: 'd-1', code: 'P', name: 'P' }]),
      ),
      isDirectionActivated: jest.fn(recorded('isDirectionActivated', true)),
    };
    const employees = { countActive: jest.fn(recorded('employeesCountActive', 2)) };
    const service = new OrganizationService(
      repo as unknown as OrganizationRepo,
      departments as unknown as DepartmentDirectoryService,
      employees as unknown as EmployeeDirectoryService,
      costCenters as unknown as CostCenterCatalogueService,
      new DepartmentServiceAccountRegistry(),
      new OrganizationChangeService(new OrganizationChangeRegistry(), {} as AnnouncementRepo, {} as TransactionRunner),
    );
    return { service, calls };
  }

  it('passes the caller transaction to the zone read and to each of the five fact reads', async () => {
    const { service, calls } = build();

    await expect(service.getOnboardingFacts(TX)).resolves.toMatchObject({
      activeDepartments: 1,
      activeEmployees: 2,
      costCenterDirectionActivated: true,
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
      'isDirectionActivated',
    ]);
    expect(calls.filter(({ client }) => client !== TX)).toEqual([]);
  });

  it('passes no transaction for the onboarding checklist, which reads without one', async () => {
    const { service, calls } = build();

    await service.getOnboardingFacts();

    expect(calls.filter(({ client }) => client === TX)).toEqual([]);
  });
});
