import { Test } from '@nestjs/testing';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { EmployeeNotStartedError, FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestPlanBoundToDeviceError, AccessRequestPlanNotFoundError } from './access-request.errors';
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
    notStartedAmong: jest.fn().mockResolvedValue(new Set()),
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
    organization.notStartedAmong.mockResolvedValue(new Set());
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

    it('BR-MF1-06a, R-46: a request sent on 28/10 for a right with no end costs 2 months of this year (28/10, 28/11, 28/12: 3) and twelve of the next', async () => {
      given(COST_CENTER, 'SAAS');
      catalog.getPlanPrice.mockResolvedValue(monthly);

      const { pricing } = await service.assess(tx, input({ termMonths: null }));

      expect(pricing).toMatchObject({ status: 'PRICED', kind: 'RECURRING', amountMonths: 3, budgetYear: 2026 });
      expect(pricing.amount).toEqual({ amountMinor: 6000n, currency: 'USD' });
      expect(pricing.nextYearAmount).toEqual({ amountMinor: 24000n, currency: 'USD' });
      expect(pricing.expectedEndDate).toBeNull();
    });

    it('QĐ-111j, R-39: 4 months from 28/10 are counted by the months that begin: 28/10, 28/11 and 28/12 this year, 28/01 the next', async () => {
      given(COST_CENTER, 'SAAS');
      catalog.getPlanPrice.mockResolvedValue(monthly);

      const assessed = await service.assess(tx, input({ termMonths: 4 }));

      expect(assessed.termRefusal).toBeNull();
      expect(assessed.term).toMatchObject({ months: 4, end: '2027-02-27', cutAt: null, startedMonths: 4 });
      expect(assessed.pricing).toMatchObject({ amountMonths: 3, expectedEndDate: null });
      expect(assessed.pricing.nextYearAmount).toEqual({ amountMinor: 2000n, currency: 'USD' });
    });

    it('R-38: a person with a term whose contract ends before the time of use is cut at it, and not refused', async () => {
      given(COST_CENTER, 'SAAS');
      organization.getEmployee.mockResolvedValue({ employmentType: 'INTERN', contractEndDate: '2026-12-31' });
      catalog.getPlanPrice.mockResolvedValue(monthly);

      const assessed = await service.assess(tx, input({ termMonths: 9 }));

      expect(assessed.termRefusal).toBeNull();
      expect(assessed.term).toMatchObject({ end: '2026-12-31', cutAt: '2026-12-31', startedMonths: 3 });
      expect(assessed.pricing).toMatchObject({ amountMonths: 3, nextYearAmount: null });
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

    it('FR-2.8, INV-07: a contractor, a freelancer or an intern gives the months and never a right with no end; a staff member may', async () => {
      given(COST_CENTER, 'SAAS');
      organization.getEmployee.mockResolvedValue({ employmentType: 'INTERN' });
      expect((await service.assess(tx, input())).termRefusal).toBe('TERM_REQUIRED');
      expect((await service.assess(tx, input({ termMonths: null }))).termRefusal).toBe('TERM_LONG_TERM_NOT_ALLOWED');
      expect((await service.assess(tx, input({ termMonths: 6 }))).termRefusal).toBeNull();

      organization.getEmployee.mockResolvedValue({ employmentType: 'STAFF' });
      expect((await service.assess(tx, input({ termMonths: null }))).termRefusal).toBeNull();
    });

    it('QĐ-111i: the months follow the kind of the plan: K1 asks for 1 to 9, K4 asks none', async () => {
      const kind = (provisioningType: string) =>
        catalog.findPlanSeatTargets.mockResolvedValue([
          { planId: 'p-1', applicationKind: 'SAAS', applicationStatus: 'ACTIVE', provisioningType },
        ]);
      given(COST_CENTER, 'SAAS');
      kind('K1');
      expect((await service.assess(tx, input())).termRefusal).toBe('TERM_REQUIRED');
      expect((await service.assess(tx, input({ termMonths: 10 }))).termRefusal).toBe('TERM_MONTHS_OUT_OF_RANGE');
      expect((await service.assess(tx, input({ termMonths: 9 }))).termRefusal).toBeNull();
      kind('K4');
      expect((await service.assess(tx, input({ termMonths: 3 }))).termRefusal).toBe('TERM_NOT_ASKED');
      expect((await service.assess(tx, input({ termMonths: null }))).termRefusal).toBeNull();
    });

    it('INV-07: a person with a term asks a plan bought once only with the end of their contract known, since the seat ends there', async () => {
      given(COST_CENTER, 'SAAS');
      catalog.findPlanSeatTargets.mockResolvedValue([
        { planId: 'p-1', applicationKind: 'SAAS', applicationStatus: 'ACTIVE', provisioningType: 'K4' },
      ]);
      organization.getEmployee.mockResolvedValue({ employmentType: 'INTERN', contractEndDate: null });
      expect((await service.assess(tx, input())).termRefusal).toBe('TERM_LONG_TERM_NOT_ALLOWED');

      organization.getEmployee.mockResolvedValue({ employmentType: 'INTERN', contractEndDate: '2027-01-31' });
      expect((await service.assess(tx, input())).termRefusal).toBeNull();
    });
  });

  describe('T-RQ3: a request to go on using the right (QĐ-111l, R-38, R-39, R-46)', () => {
    // A `K1` plan of 600.000 d a month granted on 05/08/2026 for 3 months ends on 04/11/2026; the holder asks for 3 months more on 05/10.
    const vnd = (amountMinor: bigint) => ({ amountMinor, currency: 'VND' });
    const price = { kind: 'RECURRING', unitPrice: vnd(600_000n), billingCycle: 'MONTHLY' };
    const plan = (provisioningType: string) =>
      catalog.findPlanSeatTargets.mockResolvedValue([
        { planId: 'p-1', applicationKind: 'SAAS', applicationStatus: 'ACTIVE', provisioningType },
      ]);
    /** The new period begins the day after the right ends (`QĐ-98`). */
    const renewing = (over: Partial<AssessmentInput> = {}) => input({ termStart: '2026-11-05', ...over });

    beforeEach(() => {
      organization.businessToday.mockResolvedValue('2026-10-05');
      catalog.getPlanPrice.mockResolvedValue(price);
      given(COST_CENTER, 'SAAS');
    });

    it('3 months from 05/11/2026 end on 04/02/2027 and cost 2 months of 2026 and 1 of 2027, by the months that begin', async () => {
      plan('K1');

      const assessed = await service.assess(tx, renewing({ termMonths: 3 }));

      expect(assessed.termRefusal).toBeNull();
      expect(assessed.term).toMatchObject({ start: '2026-11-05', end: '2027-02-04', cutAt: null, startedMonths: 3 });
      expect(assessed.pricing).toMatchObject({ amountMonths: 2, budgetYear: 2026, expectedEndDate: '2027-02-04' });
      expect(assessed.pricing.amount).toEqual(vnd(1_200_000n));
      expect(assessed.pricing.nextYearAmount).toEqual(vnd(600_000n));
    });

    it('a right to go on with no end (K2, Dùng lâu dài) costs the months of 2026 that begin and twelve months of the year after', async () => {
      plan('K2');

      const assessed = await service.assess(tx, renewing({ termMonths: null }));

      expect(assessed.termRefusal).toBeNull();
      expect(assessed.term).toMatchObject({ start: '2026-11-05', end: null, cutAt: null });
      expect(assessed.pricing).toMatchObject({ amountMonths: 2, expectedEndDate: null });
      expect(assessed.pricing.amount).toEqual(vnd(1_200_000n));
      expect(assessed.pricing.nextYearAmount).toEqual(vnd(7_200_000n));
    });

    it('a person with a term is cut at the end of the contract and not refused: 3 months from 05/11 end on 31/12/2026', async () => {
      plan('K1');
      organization.getEmployee.mockResolvedValue({ employmentType: 'INTERN', contractEndDate: '2026-12-31' });

      const assessed = await service.assess(tx, renewing({ termMonths: 3 }));

      expect(assessed.termRefusal).toBeNull();
      expect(assessed.term).toMatchObject({ end: '2026-12-31', cutAt: '2026-12-31', startedMonths: 2 });
      expect(assessed.pricing).toMatchObject({ amountMonths: 2, nextYearAmount: null, expectedEndDate: '2026-12-31' });
    });

    it('refuses what the kind of the plan does not take: K1 over 9 months, K2 over 12, a right with no end for K1 or for a person with a term', async () => {
      plan('K1');
      expect((await service.assess(tx, renewing({ termMonths: 10 }))).termRefusal).toBe('TERM_MONTHS_OUT_OF_RANGE');
      expect((await service.assess(tx, renewing({ termMonths: 9 }))).termRefusal).toBeNull();
      expect((await service.assess(tx, renewing({ termMonths: null }))).termRefusal).toBe('TERM_REQUIRED');
      plan('K2');
      expect((await service.assess(tx, renewing({ termMonths: 13 }))).termRefusal).toBe('TERM_MONTHS_OUT_OF_RANGE');
      expect((await service.assess(tx, renewing({ termMonths: 12 }))).termRefusal).toBeNull();
      organization.getEmployee.mockResolvedValue({ employmentType: 'FREELANCER', contractEndDate: '2027-06-30' });
      expect((await service.assess(tx, renewing({ termMonths: null }))).termRefusal).toBe('TERM_LONG_TERM_NOT_ALLOWED');
    });

    it('a plan bought once is not renewed, whoever holds it and whatever the end of their contract: months are not asked, and no end is not given', async () => {
      plan('K4');
      organization.getEmployee.mockResolvedValue({ employmentType: 'INTERN', contractEndDate: '2027-01-31' });

      expect((await service.assess(tx, renewing({ termMonths: 3 }))).termRefusal).toBe('TERM_NOT_ASKED');
      expect((await service.assess(tx, renewing({ termMonths: null }))).termRefusal).toBe('TERM_NOT_ASKED');
    });

    it('a plan bought once is not renewed by a staff member either: a right with no end (longTerm) for K4 is refused as asking no time of use', async () => {
      plan('K4');
      organization.getEmployee.mockResolvedValue({ employmentType: 'STAFF' });

      expect((await service.assess(tx, renewing({ termMonths: null }))).termRefusal).toBe('TERM_NOT_ASKED');
      expect((await service.assess(tx, renewing({ termMonths: 3 }))).termRefusal).toBe('TERM_NOT_ASKED');
      // A new request for the same plan is not a renewal: a staff member sends it with no months.
      expect((await service.assess(tx, input({ termMonths: null }))).termRefusal).toBeNull();
    });

    it('forwards tx to licensing.getSeatsHeldInPlans', async () => {
      given(COST_CENTER, 'INTERNAL');
      catalog.findPlanSeatTargets.mockResolvedValue([
        { planId: 'p-1', applicationKind: 'INTERNAL', applicationStatus: 'ACTIVE', provisioningType: 'K1' },
      ]);

      await service.assess(tx, input({ termMonths: 3 }));

      expect(licensing.getSeatsHeldInPlans).toHaveBeenCalledWith('e-1', ['p-1'], { skip: 0, take: 1 }, tx);
    });

    it.each(['DEVICE_KEY', 'DEVICE_BUNDLED'] as const)(
      'refuses %s device-bound plans with AccessRequestPlanBoundToDeviceError (W2-18)',
      async (keyBinding) => {
        given(COST_CENTER, 'SAAS');
        catalog.findPlanSeatTargets.mockResolvedValue([
          {
            planId: 'p-1',
            applicationKind: 'LICENSED',
            applicationStatus: 'APPROVED',
            provisioningType: 'K4',
            keyBinding,
          },
        ]);

        await expect(service.assess(tx, input())).rejects.toBeInstanceOf(AccessRequestPlanBoundToDeviceError);
        expect(organization.lockDepartmentShared).not.toHaveBeenCalled();
      },
    );
  });

  it('rejects future-placed employee, requester, and proposal with EmployeeNotStartedError', async () => {
    given(COST_CENTER, 'INTERNAL');
    organization.notStartedAmong.mockResolvedValue(new Set(['e-1', 'e-req']));
    await expect(service.assess(tx, input({ requesterEmployeeId: 'e-req' }))).rejects.toThrow(EmployeeNotStartedError);
    organization.getOwningUnits.mockResolvedValue(new Map());
    await expect(service.assess(tx, input())).rejects.toThrow(EmployeeNotStartedError);
    await expect(service.assessProposal(tx, input())).rejects.toThrow(EmployeeNotStartedError);
  });
});
