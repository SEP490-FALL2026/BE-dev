import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MailTransport } from '../../infrastructure/mail/mail-transport';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { DbTx } from '../../infrastructure/database/transaction-runner';
import { BudgetsReadFacadeModule } from '../budgets/budgets-read-facade.module';
import { BudgetsReadApi } from '../budgets/public/budgets-read.api';
import { PayloadCipher } from '../notifications/email/payload-cipher.service';
import type { AccessRequestRecord } from './access-request/access-request.types';
import { RequestsWorkFacadeModule } from './requests-work-facade.module';
import { BudgetCheckService } from './spend/budget-check.service';

const ORG_ID = 'org-1';
const DEPT_ID = 'dept-1';
const CC_ID = 'cc-1';
const PLAN_ID = 'plan-k2';
const SUB_ID = 'sub-k2';
const EMP_1 = 'emp-1';
const EMP_2 = 'emp-2';

function makeFakeDb() {
  const jan1 = new Date('2027-01-01T00:00:00.000Z');
  return {
    organization: {
      findFirst: jest.fn().mockResolvedValue({
        id: ORG_ID,
        name: 'Acme',
        timeZone: 'Asia/Ho_Chi_Minh',
        reportingCurrency: 'VND',
      }),
    },
    costCenter: {
      findMany: jest.fn().mockResolvedValue([{ id: CC_ID, departmentId: DEPT_ID }]),
    },
    employeePlacement: {
      findMany: jest.fn().mockResolvedValue([
        { employeeId: EMP_1, departmentId: DEPT_ID, validFrom: jan1, validTo: null },
        { employeeId: EMP_2, departmentId: DEPT_ID, validFrom: jan1, validTo: null },
      ]),
    },
    department: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: DEPT_ID,
          code: 'TK',
          name: 'Design',
          status: 'ACTIVE',
          costCenter: { id: CC_ID, code: 'CC-TK', name: 'CC Design', status: 'ACTIVE' },
        },
      ]),
    },
    plan: {
      findUnique: jest.fn().mockResolvedValue({
        id: PLAN_ID,
        provisioningType: 'K2',
        referencePriceMinor: 1_000_000n,
        referencePriceCurrency: 'VND',
        referenceCommitmentMonths: 1,
      }),
      findMany: jest.fn().mockResolvedValue([{ id: PLAN_ID, provisioningType: 'K2', referencePriceMinor: 500_000n }]),
    },
    subscriptionLine: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    subscription: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: SUB_ID,
          planId: PLAN_ID,
          responsibleItAdminEmployeeId: null,
          kind: 'TERM',
          status: 'ACTIVE',
          provisioningType: 'K2',
          commitmentTermMonths: 1,
          billingCycle: 'MONTHLY',
          purchasedQuantity: 10,
          unitPriceMinor: 500_000n,
          unitPriceCurrency: 'VND',
          monthlyUnitPriceMinor: 500_000n,
          priceRecordedOn: jan1,
          priceRate: null,
          priceRateDate: null,
          priceRateSource: null,
          priceReportingMinor: 500_000n,
          priceReportingCurrency: 'VND',
          priceExchangeRateId: null,
          originalUnitPriceMinor: null,
          originalCurrency: null,
          startDate: jan1,
          endDate: null,
          renewalDate: null,
          noticeDeadline: null,
          noticePeriodDays: null,
          autoRenew: true,
          allowsMidTermReduction: true,
          vendorMinimumSeats: null,
          isPrimaryForPlan: true,
          renewedFromId: null,
          workspace: null,
          seatCounting: 'FIXED',
          minimumSeatsTotal: null,
          invoicedLater: false,
          createdAt: jan1,
          updatedAt: jan1,
          plan: {
            name: 'Figma',
            pricingModel: 'PER_SEAT',
            provisioningType: 'K2',
            hasAdminConsole: false,
            application: {
              id: 'app-1',
              name: 'Figma',
              logoUrl: null,
              kind: 'SAAS',
              vendor: { id: 'vendor-1', name: 'Figma Inc' },
            },
          },
        },
      ]),
    },
    budgetVersion: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'ver-2027',
          costCenterId: CC_ID,
          year: 2027,
          currency: 'VND',
          baseMinor: 10_000_000n,
          reserveMinor: 5_000_000n,
          totalMinor: 15_000_000n,
        },
      ]),
    },
    budgetCommitment: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    budgetAdjustment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    licenseAssignment: {
      findMany: jest.fn().mockImplementation((args?: { where?: { subscriptionId?: unknown } }) => {
        if (args?.where?.subscriptionId === null) return Promise.resolve([]);
        return Promise.resolve([
          {
            id: 'asg-1',
            subscriptionId: SUB_ID,
            planId: PLAN_ID,
            employeeId: EMP_1,
            kind: 'PERSONAL',
            source: 'BASELINE',
            owningDepartmentId: null,
            validFrom: jan1,
            grantedOn: jan1,
            validUntil: null,
          },
          {
            id: 'asg-2',
            subscriptionId: SUB_ID,
            planId: PLAN_ID,
            employeeId: EMP_2,
            kind: 'PERSONAL',
            source: 'BASELINE',
            owningDepartmentId: null,
            validFrom: jan1,
            grantedOn: jan1,
            validUntil: null,
          },
        ]);
      }),
    },
    seatMonthRun: {
      findMany: jest.fn().mockResolvedValue(
        [1, 2, 3, 4, 5, 6].map((m) => ({
          subscriptionId: SUB_ID,
          month: new Date(`2027-0${m}-01T00:00:00.000Z`),
        })),
      ),
    },
    requestBudgetCheck: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $queryRaw: jest.fn().mockImplementation((query: unknown, ...values: unknown[]) => {
      const strings = Array.isArray(query)
        ? query
        : typeof query === 'object' && query !== null && 'strings' in query
          ? ((query as { strings?: readonly string[] }).strings ?? [])
          : [];
      const text = `${strings.join(' ')} ${JSON.stringify(values)}`;
      if (text.includes('departments')) {
        return Promise.resolve([
          {
            id: DEPT_ID,
            code: 'TK',
            name: 'Design',
            function_description: null,
            status: 'ACTIVE',
            created_at: jan1,
            updated_at: jan1,
            deactivated_at: null,
            effective_from: jan1,
            avatar_object_key: null,
            avatar_content_type: null,
            is_starting: false,
            cc_id: CC_ID,
            cc_code: 'CC-TK',
            cc_name: 'CC Design',
            cc_status: 'ACTIVE',
            it_id: null,
            it_code: null,
            it_name: null,
            it_status: null,
          },
        ]);
      }

      return Promise.resolve([]);
    }),
  };
}

describe('BudgetCheckService in worker graph (B-4)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('wires live RunningUncommittedReader into BudgetsReadApi so worker BudgetCheckService returns USES_RESERVE when uncommitted pushes over base', async () => {
    jest.useFakeTimers({
      now: new Date('2027-07-08T01:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout'],
    });
    const fakeDb = makeFakeDb();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        BudgetsReadFacadeModule,
        RequestsWorkFacadeModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(fakeDb)
      .overrideProvider(PayloadCipher)
      .useValue({})
      .overrideProvider(MailTransport)
      .useValue({})
      .compile();

    try {
      await moduleRef.init();
      const checkService = moduleRef.get(BudgetCheckService);
      const budgetsRead = moduleRef.get(BudgetsReadApi);
      expect(budgetsRead).toBeDefined();

      // Subscription price 500k/mo (2 uncommitted seats x 6 months = 6M uncommitted)
      // and request has 2 beneficiaries -> 2 x 500k x 6 = 6M request cost.
      // Total = 6M + 6M = 12M > 10M base (USES_RESERVE), <= 15M base+reserve.
      const request: AccessRequestRecord = {
        id: 'req-worker-check',
        organizationId: ORG_ID,
        type: 'GROUP_GRANT',
        branch: 'PAID_IN_CATALOG',
        state: 'AWAITING_SPEND_DECISION',
        planId: PLAN_ID,
        requesterEmployeeId: EMP_1,
        departmentId: DEPT_ID,
        costCenterId: CC_ID,
        businessReason: 'Need seats',
        termMonths: null,
        pricing: {
          status: 'PRICED',
          missingReason: null,
          kind: 'RECURRING',
          budgetYear: 2027,
          expectedEndDate: null,
          amountMonths: 6,
          amount: { amountMinor: 6_000_000n, currency: 'VND' },
          unitPrice: { amountMinor: 500_000n, currency: 'VND' },
          billingCycle: 'MONTHLY',
          nextYearAmount: null,
        },
        planLine: null,
        offPlan: false,
        expectedEndDate: null,
        policy: {
          version: 2,
          branch: 'PAID_IN_CATALOG',
          chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
          slaWorkingDays: 3,
        },
        submittedAt: new Date('2027-07-08T01:00:00.000Z'),
        withdrawal: null,
        cancellation: null,
        serviceAccount: null,
        renewal: null,
        beneficiaryEmployeeIds: [EMP_1, EMP_2],
        needStep: {
          id: 'step-1',
          state: 'APPROVED',
          assigneeEmployeeId: EMP_1,
          routingRow: 1,
          waitingReason: null,
          samePersonAsSpend: false,
          slaWorkingDays: 3,
          createdAt: new Date('2027-07-08T01:00:00.000Z'),
          assignedAt: new Date('2027-07-08T01:00:00.000Z'),
          decidedAt: new Date('2027-07-08T01:00:00.000Z'),
        },
        needSteps: [],
        needDecision: null,
        lines: [
          {
            requestId: 'req-worker-check',
            employeeId: EMP_1,
            position: 1,
            state: 'NEED_CONFIRMED',
            needStepId: 'step-1',
            expectedEndDate: null,
            endedAt: null,
            endedByEmployeeId: null,
            endReason: null,
            cancelCause: null,
            withdrawalRequestedAt: null,
          },
          {
            requestId: 'req-worker-check',
            employeeId: EMP_2,
            position: 2,
            state: 'NEED_CONFIRMED',
            needStepId: 'step-1',
            expectedEndDate: null,
            endedAt: null,
            endedByEmployeeId: null,
            endReason: null,
            cancelCause: null,
            withdrawalRequestedAt: null,
          },
        ],
      };

      const computed = await checkService.compute(
        fakeDb as unknown as DbTx,
        request,
        new Date('2027-07-08T01:00:00.000Z'),
      );

      expect(computed.status).toBe('COMPUTED');
      if (computed.status === 'COMPUTED') {
        expect(computed.result.years[0]).toMatchObject({
          year: 2027,
          costMinor: 6_000_000n,
          remainingBaseMinor: 4_000_000n,
          remainingWithReserveMinor: 9_000_000n,
        });
        expect(computed.result.outcome).toBe('USES_RESERVE');
      }
    } finally {
      await moduleRef.close();
    }
  });
});
