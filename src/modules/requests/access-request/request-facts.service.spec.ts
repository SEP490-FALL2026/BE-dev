import { Test } from '@nestjs/testing';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestPlanNotFoundError } from './access-request.errors';
import { RequestFactsService, type AssessmentInput } from './request-facts.service';
import { TransferGraceHoldContributions } from '../public/requests.extension-points';
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
    getEmployee: jest.fn(),
  };
  const catalog = { findPlanSeatTargets: jest.fn(), getPlanPrice: jest.fn() };
  const routing = { gather: jest.fn() };
  const licensing = { getSeatsHeldInPlans: jest.fn() };
  const graceHolds = { holdingOf: jest.fn() };

  let service: RequestFactsService;

  const input = (over: Partial<AssessmentInput> = {}): AssessmentInput => ({
    employeeId: 'e-1',
    planId: 'p-1',
    now: new Date('2026-10-28T03:00:00Z'),
    settings: { slaWorkingDays: 2 },
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
    organization.getEmployee.mockResolvedValue({ employmentType: 'STAFF' });
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
    graceHolds.holdingOf.mockResolvedValue(null);

    const module = await Test.createTestingModule({
      providers: [
        RequestFactsService,
        { provide: OrganizationReadApi, useValue: organization },
        { provide: CatalogApi, useValue: catalog },
        { provide: RoutingFactsService, useValue: routing },
        { provide: OperatingParametersApi, useValue: { getValue: jest.fn() } },
        { provide: LicensingApi, useValue: licensing },
        { provide: TransferGraceHoldContributions, useValue: { all: () => [graceHolds] } },
      ],
    }).compile();
    service = module.get(RequestFactsService);
  });

  describe('QĐ-110q, R-49: the seat held is a right from before a transfer in its grace', () => {
    const SEAT = { id: 'a-1', effectiveFrom: '2026-09-01', validUntil: null };

    it('asks the contributions of the grace about the seat held, the person and the day, and says so', async () => {
      given(COST_CENTER, 'SAAS');
      licensing.getSeatsHeldInPlans.mockResolvedValue({ items: [SEAT], total: 1 });
      graceHolds.holdingOf.mockResolvedValue({ transferId: 't-1', assignmentId: 'a-1' });

      const assessed = await service.assess(tx, input());

      expect(assessed.heldAccess).toEqual({ assignmentId: 'a-1', effectiveFrom: '2026-09-01', validUntil: null });
      expect(assessed.graceHold).toEqual({ transferId: 't-1', assignmentId: 'a-1' });
      expect(graceHolds.holdingOf).toHaveBeenCalledWith(
        { employeeId: 'e-1', assignmentId: 'a-1', effectiveFrom: '2026-09-01', today: assessed.today },
        tx,
      );
    });

    it('has no grace for a seat that is not one of those, and asks nobody when nothing is held', async () => {
      given(COST_CENTER, 'SAAS');
      licensing.getSeatsHeldInPlans.mockResolvedValue({ items: [SEAT], total: 1 });
      graceHolds.holdingOf.mockResolvedValue(null);
      expect((await service.assess(tx, input())).graceHold).toBeNull();

      licensing.getSeatsHeldInPlans.mockResolvedValue({ items: [], total: 0 });
      graceHolds.holdingOf.mockClear();
      const nothing = await service.assess(tx, input());

      expect(nothing.heldAccess).toBeNull();
      expect(nothing.graceHold).toBeNull();
      expect(graceHolds.holdingOf).not.toHaveBeenCalled();
    });
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

  describe('the amount and the end date of a request for paid software (BR-MF1-06, BR-MF1-07, FR-2.8)', () => {
    const monthly = { kind: 'RECURRING', unitPrice: { amountMinor: 2000n, currency: 'USD' }, billingCycle: 'MONTHLY' };

    it("BR-MF1-07: the price is the plan's from the catalog, not a department's: no department is asked for it", async () => {
      given(COST_CENTER, 'SAAS');
      catalog.getPlanPrice.mockResolvedValue(monthly);

      await service.assess(tx, input());

      expect(catalog.getPlanPrice).toHaveBeenCalledWith('p-1', tx);
    });

    it('BR-MF1-06a: a request sent on 28/10 with no end date costs the months left of the year, the month it starts counted whole', async () => {
      given(COST_CENTER, 'SAAS');
      catalog.getPlanPrice.mockResolvedValue(monthly);

      const { pricing } = await service.assess(tx, input());

      expect(pricing).toMatchObject({ status: 'PRICED', kind: 'RECURRING', amountMonths: 3, budgetYear: 2026 });
      expect(pricing.amount).toEqual({ amountMinor: 6000n, currency: 'USD' });
    });

    it('BR-MF1-06c: an end date inside the year stops the amount in its month', async () => {
      given(COST_CENTER, 'SAAS');
      catalog.getPlanPrice.mockResolvedValue(monthly);

      const { pricing } = await service.assess(tx, input({ expectedEndDate: '2026-11-15' }));

      expect(pricing).toMatchObject({ amountMonths: 2, expectedEndDate: '2026-11-15' });
    });

    it('BR-MF1-07: a one-time price (a key) is the price of the purchase, with no months', async () => {
      given(COST_CENTER, 'SAAS');
      catalog.getPlanPrice.mockResolvedValue({
        kind: 'ONE_TIME',
        unitPrice: { amountMinor: 50_000n, currency: 'USD' },
        billingCycle: 'OTHER',
      });

      const { pricing } = await service.assess(tx, input());

      expect(pricing).toMatchObject({ kind: 'ONE_TIME', amountMonths: null });
      expect(pricing.amount).toEqual({ amountMinor: 50_000n, currency: 'USD' });
    });

    it('FR-2.8: a contractor, a freelancer or an intern needs an end date; a staff member does not', async () => {
      given(COST_CENTER, 'SAAS');
      organization.getEmployee.mockResolvedValue({ employmentType: 'INTERN' });
      expect((await service.assess(tx, input())).termRequired).toBe(true);
      expect((await service.assess(tx, input({ expectedEndDate: '2026-12-31' }))).termRequired).toBe(false);

      organization.getEmployee.mockResolvedValue({ employmentType: 'STAFF' });
      expect((await service.assess(tx, input())).termRequired).toBe(false);
    });

    it('US-05-23 AC-9: an end date before today or past a year from today is out of range (28/10/2026 ⟹ at most 27/10/2027)', async () => {
      given(COST_CENTER, 'SAAS');

      const limit = await service.assess(tx, input({ expectedEndDate: '2027-10-27' }));
      expect(limit.maxEndDate).toBe('2027-10-27');
      expect(limit.endDateOutOfRange).toBe(false);
      expect((await service.assess(tx, input({ expectedEndDate: '2027-10-28' }))).endDateOutOfRange).toBe(true);
      expect((await service.assess(tx, input({ expectedEndDate: '2026-10-27' }))).endDateOutOfRange).toBe(true);
    });
  });
});
