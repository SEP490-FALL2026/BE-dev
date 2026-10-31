import { Test } from '@nestjs/testing';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AccessRequestPlanNotFoundError } from './access-request.errors';
import { RequestFactsService, type AssessmentInput } from './request-facts.service';
import { RoutingFactsService } from './routing-facts.service';

const TODAY = '2026-10-28';
const COST_CENTER = { id: 'cc-1', code: 'CC-1', status: 'ACTIVE' as const };

/**
 * What a request is judged by and where the gate of a department with no Cost Center stands (`QĐ-87g`): a request that costs money
 * and the request of a service seat are stopped when the department has none in use, before anything is locked or priced; a free internal
 * request is judged without one. Driven through the public method with in-memory collaborators.
 */
describe('RequestFactsService.assess', () => {
  const tx = { name: 'tx' } as unknown as DbTx;
  const organization = {
    businessToday: jest.fn(),
    getOwningUnits: jest.fn(),
    requireUnitCostCenter: jest.fn(),
    lockDepartmentShared: jest.fn(),
  };
  const catalog = { findPlanSeatTargets: jest.fn(), getPlanPrice: jest.fn() };
  const routing = { gather: jest.fn() };
  const licensing = { getSeatsHeldInPlans: jest.fn() };

  let service: RequestFactsService;

  const input = (over: Partial<AssessmentInput> = {}): AssessmentInput => ({
    employeeId: 'e-1',
    planId: 'p-1',
    termMonths: 6,
    expectedSpendOn: undefined,
    now: new Date('2026-10-28T03:00:00Z'),
    settings: { slaWorkingDays: 2, fiscalYearStartMonth: 1 },
    lockDepartment: true,
    ...over,
  });
  /** The department of the employee, with the Cost Center it has in use or none, and the plan of the application kind asked for. */
  const given = (
    costCenter: typeof COST_CENTER | null,
    kind: 'INTERNAL' | 'SAAS',
    applicationStatus: 'ACTIVE' | 'RETIRED' = 'ACTIVE',
  ): void => {
    organization.getOwningUnits.mockResolvedValue(new Map([['e-1', { departmentId: 'd-1', costCenter }]]));
    catalog.findPlanSeatTargets.mockResolvedValue([{ planId: 'p-1', applicationKind: kind, applicationStatus }]);
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    organization.businessToday.mockResolvedValue(TODAY);
    organization.lockDepartmentShared.mockResolvedValue(undefined);
    // The real rule: the unit with its Cost Center, or the error of a department that has none.
    organization.requireUnitCostCenter.mockImplementation((unit: { departmentId: string; costCenter: unknown }) => {
      if (!unit.costCenter) throw new FinanceSetupIncompleteError(unit.departmentId);

      return unit;
    });
    catalog.getPlanPrice.mockResolvedValue(null);
    routing.gather.mockResolvedValue({
      facts: {
        requesterEmployeeId: 'e-1',
        departmentHeadEmployeeId: 'h-1',
        spendingApproverEmployeeId: 'a-1',
        fallbackApproverEmployeeId: null,
        chainHasSpendStep: false,
      },
      departmentHeadEmployeeId: 'h-1',
    });
    licensing.getSeatsHeldInPlans.mockResolvedValue({ items: [], total: 0 });

    const module = await Test.createTestingModule({
      providers: [
        RequestFactsService,
        { provide: OrganizationApi, useValue: organization },
        { provide: CatalogApi, useValue: catalog },
        { provide: RoutingFactsService, useValue: routing },
        { provide: OperatingParametersApi, useValue: { getValue: jest.fn() } },
        { provide: LicensingApi, useValue: licensing },
      ],
    }).compile();
    service = module.get(RequestFactsService);
  });

  it('judges a free internal request of a department with no Cost Center in use, charged to none, and locks the department', async () => {
    given(null, 'INTERNAL');

    const assessed = await service.assess(tx, input());

    expect(assessed.unit).toEqual({ departmentId: 'd-1', costCenter: null });
    expect(assessed.policy.branch).toBe('INTERNAL_FREE');
    expect(assessed.pricing.status).toBe('NOT_APPLICABLE');
    expect(organization.requireUnitCostCenter).not.toHaveBeenCalled();
    expect(organization.lockDepartmentShared).toHaveBeenCalledWith(tx, 'd-1');
  });

  it('judges a free internal request of a department that has one with that Cost Center', async () => {
    given(COST_CENTER, 'INTERNAL');

    const assessed = await service.assess(tx, input());

    expect(assessed.unit.costCenter).toEqual(COST_CENTER);
  });

  it('stops a request that costs money in a department with none, before it locks or prices anything', async () => {
    given(null, 'SAAS');

    await expect(service.assess(tx, input())).rejects.toBeInstanceOf(FinanceSetupIncompleteError);

    expect(organization.lockDepartmentShared).not.toHaveBeenCalled();
    expect(catalog.getPlanPrice).not.toHaveBeenCalled();
    expect(routing.gather).not.toHaveBeenCalled();
  });

  it('stops the request of a service seat in a department with none even when the software is free, because the seat is charged to the Unit', async () => {
    given(null, 'INTERNAL');

    await expect(service.assess(tx, input({ chargedToUnit: true }))).rejects.toBeInstanceOf(
      FinanceSetupIncompleteError,
    );

    expect(organization.lockDepartmentShared).not.toHaveBeenCalled();
  });

  it('answers a plan that does not exist as that, not as an unfinished finance setup, in a department with none', async () => {
    given(null, 'SAAS');
    catalog.findPlanSeatTargets.mockResolvedValue([undefined]);

    await expect(service.assess(tx, input())).rejects.toBeInstanceOf(AccessRequestPlanNotFoundError);
  });
});
