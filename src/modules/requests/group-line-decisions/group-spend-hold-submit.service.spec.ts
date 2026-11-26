import { Test } from '@nestjs/testing';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { RequestPartyEligibilityApi } from '../../identity-access/public/request-party-eligibility.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { pricingColumns, toPricing } from '../access-request/access-request-pricing.mapper';
import type { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, NewAccessRequest } from '../access-request/access-request.types';
import { RequestFactsService } from '../access-request/request-facts.service';
import { RoutingFactsService } from '../access-request/routing-facts.service';
import type { LineAmountRepo, NewLineAmount } from '../group-request/line-amount.repo';
import { GroupRequestWriter } from '../group-request-submission/group-request-writer.service';
import { GroupRequestService } from '../group-request-submission/group-request.service';
import { GroupSubmissionFactsService } from '../group-request-submission/group-submission-facts.service';
import { TransferGraceHoldContributions } from '../public/requests.extension-points';
import { RequestLimitsService } from '../request-limits/request-limits.service';
import type { RequestTermEndsService } from '../repricing/request-term-ends.service';
import type { SpendEffectsService } from '../spend-effects/spend-effects.service';
import { GroupSpendHold } from './group-spend-hold.service';

const TX = {} as DbTx;
const ACTOR = { employeeId: 'emp-approver' } as AuthenticatedPrincipal;
const CC = { id: 'cc-1', code: 'CC-1', status: 'ACTIVE' };
const emp = (id: string) => ({
  id,
  organizationId: 'org-1',
  status: 'ACTIVE',
  workEmail: `${id}@example.com`,
  employmentType: 'STAFF',
  hireDate: '2025-01-01',
  contractEndDate: null,
});

describe('GroupSpendHold (B-5 submit-time price retention)', () => {
  it('keeps submit-time monthlyPriceMinor across DB persistence when catalog price changes before approval (via real GroupRequestService.submit)', async () => {
    const stored = new Map<string, AccessRequestRecord>();
    let currentPrice = {
      kind: 'RECURRING' as const,
      provisioningType: 'K2' as const,
      referenceCommitmentMonths: 12 as const,
      unitPrice: { amountMinor: 10_000_000n, currency: 'VND' },
      monthlyPriceMinor: 833_333n,
      billingCycle: 'ANNUAL' as const,
      source: 'SUBSCRIPTION' as const,
    };
    const catalog = {
      findPlanSeatTargets: jest.fn().mockResolvedValue([
        {
          planId: 'plan-k2',
          applicationKind: 'SAAS',
          applicationStatus: 'ACTIVE',
          provisioningType: 'K2',
          referenceCommitmentMonths: 12,
        },
      ]),
      getPlanPrice: jest.fn(() => Promise.resolve(currentPrice)),
    };
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2026-11-15'),
      getOwningUnits: jest.fn().mockResolvedValue(
        new Map([
          ['emp-head', { departmentId: 'dept-1', costCenter: CC }],
          ['emp-1', { departmentId: 'dept-1', costCenter: CC }],
          ['emp-2', { departmentId: 'dept-1', costCenter: CC }],
        ]),
      ),
      notStartedAmong: jest.fn().mockResolvedValue(new Set()),
      requireUnitCostCenter: jest.fn((unit: unknown) => unit),
      lockDepartmentShared: jest.fn().mockResolvedValue(undefined),
      lockEmployeeForShare: jest.fn().mockResolvedValue(undefined),
      getEmployee: jest.fn().mockResolvedValue(emp('emp-head')),
      getEmployees: jest.fn().mockResolvedValue([emp('emp-1'), emp('emp-2')]),
    };
    const requestsRepo = {
      openRequestHolders: jest.fn().mockResolvedValue(new Set()),
      insert: jest.fn((_tx: DbTx, input: NewAccessRequest) => {
        const cols = pricingColumns(input.pricing);
        const record = {
          id: 'req-real-1',
          organizationId: input.organizationId,
          type: input.type ?? 'GRANT',
          branch: input.branch,
          state: 'AWAITING_SPEND_DECISION',
          planId: input.planId,
          requesterEmployeeId: input.requesterEmployeeId,
          beneficiaryEmployeeIds: [...input.beneficiaryEmployeeIds],
          departmentId: input.departmentId,
          costCenterId: input.costCenterId,
          businessReason: input.businessReason,
          termMonths: input.termMonths,
          pricing: toPricing({
            pricingStatus: cols.pricingStatus,
            priceMissingReason: cols.priceMissingReason,
            priceKind: cols.priceKind,
            expectedEndDate: cols.expectedEndDate,
            amountMonths: cols.amountMonths,
            budgetYear: cols.budgetYear,
            amountMinor: cols.amountMinor,
            amountCurrency: cols.amountCurrency,
            unitPriceMinor: cols.unitPriceMinor,
            monthlyPriceMinor: cols.monthlyPriceMinor,
            billingCycle: cols.billingCycle,
            nextYearAmountMinor: cols.nextYearAmountMinor,
          }),
          expectedEndDate: null,
          lines: input.beneficiaryEmployeeIds.map((employeeId) => ({
            employeeId,
            state: 'NEED_CONFIRMED',
            expectedEndDate: null,
          })),
        } as unknown as AccessRequestRecord;
        stored.set(record.id, record);
        return Promise.resolve({ id: record.id, needStepId: 'step-1' });
      }),
      recordNeedDecision: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn((id: string) => Promise.resolve(stored.get(id) ?? null)),
      setPricing: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RequestFactsService,
        { provide: OrganizationReadApi, useValue: organizationReads },
        { provide: CatalogApi, useValue: catalog },
        {
          provide: RoutingFactsService,
          useValue: {
            gather: jest.fn().mockResolvedValue({
              departmentHeadEmployeeId: 'emp-head',
              facts: { requesterRoles: ['EMPLOYEE'] },
            }),
          },
        },
        { provide: OperatingParametersApi, useValue: { getValue: jest.fn().mockResolvedValue('2') } },
        {
          provide: LicensingApi,
          useValue: { getSeatsHeldInPlans: jest.fn().mockResolvedValue({ items: [], total: 0 }) },
        },
        { provide: TransferGraceHoldContributions, useValue: { all: () => [] } },
      ],
    }).compile();
    const requestFacts = moduleRef.get(RequestFactsService);
    const submissionFacts = new GroupSubmissionFactsService(
      organizationReads as unknown as OrganizationReadApi,
      { getSeatsHeldInPlans: jest.fn().mockResolvedValue({ items: [], total: 0 }) } as unknown as LicensingApi,
      requestFacts,
      requestsRepo as unknown as AccessRequestRepo,
      {
        assertEligible: jest.fn(),
        ineligibleAmong: jest.fn().mockResolvedValue(new Map()),
      } as unknown as RequestPartyEligibilityApi,
      {
        settings: jest.fn().mockResolvedValue({}),
        lock: jest.fn(),
        judge: jest.fn().mockResolvedValue(new Map()),
      } as unknown as RequestLimitsService,
    );
    const writer = new GroupRequestWriter(
      { start: jest.fn() } as never,
      requestsRepo as unknown as AccessRequestRepo,
      { insertMany: jest.fn() } as never,
      { insertMany: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    const groupService = new GroupRequestService(
      { run: (fn: (tx: DbTx) => Promise<unknown>) => fn(TX) } as unknown as TransactionRunner,
      submissionFacts,
      requestFacts,
      organizationReads as unknown as OrganizationReadApi,
      requestsRepo as unknown as AccessRequestRepo,
      {} as never,
      writer,
      { settings: jest.fn().mockResolvedValue({}), lock: jest.fn() } as unknown as RequestLimitsService,
    );

    const submitted = await groupService.submit(
      { employeeId: 'emp-head', appUserId: 'user-head', roles: ['EMPLOYEE'] } as unknown as AuthenticatedPrincipal,
      {
        planId: 'plan-k2',
        lines: [{ employeeId: 'emp-1' }, { employeeId: 'emp-2' }],
        businessReason: 'Team access',
        termMonths: 3,
      },
    );

    currentPrice = {
      ...currentPrice,
      unitPrice: { amountMinor: 12_000_000n, currency: 'VND' },
      monthlyPriceMinor: 1_000_000n,
    };

    const inserted: NewLineAmount[][] = [];
    const holdService = new GroupSpendHold(
      requestsRepo as unknown as AccessRequestRepo,
      {
        insertMany: jest.fn((_tx: DbTx, rows: NewLineAmount[]) => {
          inserted.push(rows);
          return Promise.resolve();
        }),
      } as unknown as LineAmountRepo,
      {
        hold: jest.fn().mockResolvedValue({
          id: 'chk-real-1',
          currency: 'VND',
          years: [{ year: 2026, code: 'WITHIN_BASE', costMinor: 3_333_332n }],
        }),
      } as unknown as SpendEffectsService,
      organizationReads as unknown as OrganizationReadApi,
      { endsOfPeople: jest.fn().mockResolvedValue(['2027-02-14', '2027-02-14']) } as unknown as RequestTermEndsService,
      catalog as unknown as CatalogApi,
    );

    await holdService.hold(
      TX,
      ACTOR,
      submitted,
      [
        { employeeId: 'emp-1', decision: 'APPROVE' },
        { employeeId: 'emp-2', decision: 'APPROVE' },
      ],
      { checkId: 'chk-real-1', now: new Date('2026-11-15T00:00:00.000Z') },
    );

    expect(inserted[0]).toEqual([
      {
        requestId: 'req-real-1',
        employeeId: 'emp-1',
        budgetYear: 2026,
        amountMinor: 1_666_666n,
        currency: 'VND',
        held: true,
      },
      {
        requestId: 'req-real-1',
        employeeId: 'emp-2',
        budgetYear: 2026,
        amountMinor: 1_666_666n,
        currency: 'VND',
        held: true,
      },
      {
        requestId: 'req-real-1',
        employeeId: 'emp-1',
        budgetYear: 2027,
        amountMinor: 1_666_666n,
        currency: 'VND',
        held: false,
      },
      {
        requestId: 'req-real-1',
        employeeId: 'emp-2',
        budgetYear: 2027,
        amountMinor: 1_666_666n,
        currency: 'VND',
        held: false,
      },
    ]);
  });

  it('B-5: pricingColumns persists monthlyPriceMinor and toPricing reads stored column without dividing unitPrice / cycle', () => {
    const cols = pricingColumns({
      status: 'PRICED',
      missingReason: null,
      kind: 'RECURRING',
      budgetYear: 2026,
      expectedEndDate: null,
      amountMonths: 2,
      amount: { amountMinor: 1_700_000n, currency: 'VND' },
      unitPrice: { amountMinor: 10_000_000n, currency: 'VND' },
      monthlyPriceMinor: 850_000n,
      billingCycle: 'ANNUAL',
      nextYearAmount: null,
    });
    expect(cols.monthlyPriceMinor).toBe(850_000n);

    const readStored = toPricing({
      ...cols,
      monthlyPriceMinor: 850_000n,
    });
    expect(readStored.monthlyPriceMinor).toBe(850_000n);

    const readNull = toPricing({
      ...cols,
      monthlyPriceMinor: null,
    });
    expect(readNull.monthlyPriceMinor).toBeNull();
  });
});
