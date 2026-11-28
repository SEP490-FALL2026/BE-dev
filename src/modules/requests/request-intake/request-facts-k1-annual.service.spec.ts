import { Test } from '@nestjs/testing';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RequestFactsService, type AssessmentInput } from '../access-request/request-facts.service';
import { RoutingFactsService } from '../access-request/routing-facts.service';
import { TransferGraceHoldContributions } from '../public/requests.extension-points';

const COST_CENTER = { id: 'cc-1', code: 'CC-1', status: 'ACTIVE' as const };

describe('RequestFactsService.assess (P13a W3-17 K1 annual)', () => {
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
    now: new Date('2026-11-05T03:00:00Z'),
    settings: { slaWorkingDays: 2 },
    lockDepartment: true,
    ...over,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    organization.businessToday.mockResolvedValue('2026-11-05');
    organization.notStartedAmong.mockResolvedValue(new Set());
    organization.getOwningUnits.mockResolvedValue(new Map([['e-1', { departmentId: 'd-1', costCenter: COST_CENTER }]]));
    organization.requireUnitCostCenter.mockImplementation((unit: { departmentId: string; costCenter: unknown }) => {
      if (!unit.costCenter) throw new FinanceSetupIncompleteError(unit.departmentId);

      return unit;
    });
    catalog.findPlanSeatTargets.mockResolvedValue([
      {
        planId: 'p-1',
        applicationKind: 'SAAS',
        applicationStatus: 'APPROVED',
        provisioningType: 'K1',
        referenceCommitmentMonths: 12,
      },
    ]);
    catalog.getPlanPrice.mockResolvedValue({
      kind: 'RECURRING',
      unitPrice: { amountMinor: 450_000n, currency: 'VND' },
      monthlyPriceMinor: 450_000n,
      billingCycle: 'MONTHLY',
      source: 'PLAN_REFERENCE',
    });
    organization.getEmployee.mockResolvedValue({ employmentType: 'CONTRACTOR', contractEndDate: '2027-11-04' });
    routing.gather.mockResolvedValue({ facts: { requesterRoles: ['EMPLOYEE'] } });
    licensing.getSeatsHeldInPlans.mockResolvedValue({ items: [], total: 0 });
    graceHolds.holdingOf.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        RequestFactsService,
        { provide: OrganizationReadApi, useValue: organization },
        { provide: CatalogApi, useValue: catalog },
        { provide: RoutingFactsService, useValue: routing },
        { provide: OperatingParametersApi, useValue: { getValue: jest.fn().mockResolvedValue('2') } },
        { provide: LicensingApi, useValue: licensing },
        { provide: TransferGraceHoldContributions, useValue: { all: () => [graceHolds] } },
      ],
    }).compile();
    service = moduleRef.get(RequestFactsService);
  });

  it('accepts K1 annual 12m at exact boundary 04/11/2027 and refuses 03/11/2027 or non-12 months', async () => {
    const ok = await service.assess(tx, input({ termMonths: 12 }));
    expect(ok.termRefusal).toBeNull();
    expect(ok.pricing).toMatchObject({
      status: 'PRICED',
      amount: { amountMinor: 900_000n },
      nextYearAmount: { amountMinor: 4_500_000n },
    });

    organization.getEmployee.mockResolvedValue({ employmentType: 'CONTRACTOR', contractEndDate: '2027-11-03' });
    expect((await service.assess(tx, input({ termMonths: 12 }))).termRefusal).toBe('K1_ANNUAL_CONTRACT_TOO_SHORT');

    organization.getEmployee.mockResolvedValue({ employmentType: 'STAFF', contractEndDate: null });
    expect((await service.assess(tx, input({ termMonths: 6 }))).termRefusal).toBe('K1_ANNUAL_TERM_FIXED');
  });

  it('defaults omitted renewal termMonths to 12 on K1 annual', async () => {
    organization.getEmployee.mockResolvedValue({ employmentType: 'STAFF', contractEndDate: null });
    const renewed = await service.assess(tx, input({ termStart: '2027-11-05', termMonths: undefined }));
    expect(renewed.termRefusal).toBeNull();
    expect(renewed.term.end).toBe('2028-11-04');
  });

  it('QĐ-117c: prices K1 annual transfer replacement on 20/03/2027 from 05/04/2027 to 04/11/2027 (7m = 3.15M)', async () => {
    organization.businessToday.mockResolvedValue('2027-03-20');
    licensing.getSeatsHeldInPlans.mockResolvedValue({
      items: [
        {
          id: 'a-1',
          effectiveFrom: '2026-11-05',
          validUntil: null,
          personalCommitmentMonths: 12,
          billingAnchorOn: '2026-11-05',
        },
      ],
      total: 1,
    });
    graceHolds.holdingOf.mockResolvedValue({ transferId: 't-1', assignmentId: 'a-1' });

    const assessed = await service.assess(tx, input({ termMonths: 12 }));

    expect(assessed.termRefusal).toBeNull();
    expect(assessed.term.end).toBe('2027-11-04');
    expect(assessed.pricing).toMatchObject({
      status: 'PRICED',
      amountMonths: 7,
      amount: { amountMinor: 3_150_000n, currency: 'VND' },
      nextYearAmount: null,
    });
  });
});
