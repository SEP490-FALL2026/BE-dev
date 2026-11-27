import type { FinanceApi } from '../../../finance/public/finance.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { PlanFactsService } from '../../plan/plan-facts.service';
import type { SeatOccupancyHook } from '../../public/catalog.extension-points';
import type { SubscriptionLineRecord } from '../../subscription-line/subscription-line.types';
import type { WorkspaceForSubscriptionService } from '../../workspace/workspace-for-subscription.service';
import type { SubscriptionLotResponsibleService } from '../responsible/subscription-lot-responsible.service';
import type { SubscriptionGrantingRepo } from '../subscription-granting.repo';
import type { SubscriptionRecord } from '../subscription.types';
import { SubscriptionViewService } from '../subscription-view.service';
import type { SubscriptionWindowsService } from '../subscription-windows.service';

const baseDate = new Date('2026-11-15T00:00:00.000Z');

const makeRecord = (over: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
  id: 'sub-1',
  planId: 'plan-1',
  planName: 'FigJam',
  planPricingModel: 'PER_SEAT',
  planProvisioningType: 'K2',
  planHasAdminConsole: true,
  applicationId: 'app-1',
  applicationName: 'Figma',
  applicationLogoUrl: null,
  applicationKind: 'SAAS',
  vendor: { id: 'v-1', name: 'Figma' },
  kind: 'TERM',
  status: 'ACTIVE',
  purchasedQuantity: 99,
  unitPrice: null,
  monthlyUnitPriceMinor: null,
  priceSnapshot: null,
  originalPrice: null,
  billingCycle: 'MONTHLY',
  commitmentTermMonths: 1,
  startDate: '2026-11-01',
  endDate: '2027-10-31',
  renewalDate: '2027-11-01',
  noticeDeadline: null,
  noticePeriodDays: null,
  autoRenew: false,
  allowsMidTermReduction: false,
  responsibleItAdminEmployeeId: 'emp-khoa',
  vendorMinimumSeats: null,
  isPrimaryForPlan: false,
  renewedFromId: null,
  workspace: { id: 'ws-a', name: 'Figma' },
  seatCounting: 'FIXED',
  minimumSeatsTotal: null,
  invoicedLater: false,
  createdAt: baseDate,
  updatedAt: baseDate,
  ...over,
});

const makeLine = (over: Partial<SubscriptionLineRecord> = {}): SubscriptionLineRecord => ({
  id: 'line-1',
  organizationId: 'org-1',
  subscriptionId: 'sub-1',
  workspaceId: 'ws-a',
  planId: 'plan-1',
  monthlyUnitPriceMinor: 375_000n,
  minimumSeats: 2,
  ledgerOpenedOn: '2026-11-01',
  renewedFromLineId: null,
  closedOn: null,
  closedReason: null,
  createdAt: baseDate,
  updatedAt: baseDate,
  ...over,
});

describe('SubscriptionViewService lines & D-18 (W3-15)', () => {
  it('computes lines[], lineCount, seatsToday and purchasedQuantity = sum of serving lines for K2, and seats null for non-K2', async () => {
    const k2 = makeRecord({ id: 'sub-1', planProvisioningType: 'K2' });
    const k1 = makeRecord({ id: 'sub-k1', planId: 'plan-k1', planProvisioningType: 'K1', purchasedQuantity: 3 });

    const service = new SubscriptionViewService(
      {
        findCurrency: jest.fn().mockResolvedValue({ code: 'VND', minorUnit: 0 }),
        taxProfileGroups: jest.fn().mockResolvedValue(new Map()),
        estimateTaxMany: jest.fn().mockResolvedValue([]),
      } as unknown as FinanceApi,
      {
        businessToday: jest.fn().mockResolvedValue('2026-11-15'),
        getEmployees: jest.fn().mockResolvedValue([{ id: 'emp-khoa', employeeCode: 'KHOA', fullName: 'Khoa' }]),
      } as unknown as OrganizationReadApi,
      {
        vendorAdminsOf: jest.fn().mockResolvedValue(new Map()),
        workingAdminsAmong: jest.fn(),
        lookups: jest.fn().mockResolvedValue([
          { id: 'plan-1', name: 'FigJam' },
          { id: 'plan-2', name: 'Figma Design' },
          { id: 'plan-closed', name: 'Slides' },
        ]),
      } as unknown as PlanFactsService,
      {
        get: () => ({
          seatsAndPlansOfSubscriptions: jest.fn().mockResolvedValue({
            bySubscription: new Map([['sub-1', { occupied: 3, inRevocation: 0 }]]),
            bySubscriptionPlan: new Map([
              ['sub-1:plan-1', 2],
              ['sub-1:plan-2', 1],
            ]),
          }),
        }),
      } as unknown as SeatOccupancyHook,
      { idsWithSuccessor: jest.fn().mockResolvedValue(new Set()) } as unknown as SubscriptionGrantingRepo,
      { of: jest.fn().mockResolvedValue(new Map()) } as unknown as SubscriptionWindowsService,
      {
        withLines: jest.fn().mockResolvedValue(new Set(['sub-1'])),
        lotResponsibles: jest.fn().mockResolvedValue(new Map()),
        linesForSubscriptions: jest.fn().mockResolvedValue(
          new Map([
            [
              'sub-1',
              [
                { line: makeLine({ id: 'line-1', planId: 'plan-1' }), seatsToday: 5, isServing: true },
                { line: makeLine({ id: 'line-2', planId: 'plan-2' }), seatsToday: 7, isServing: true },
                {
                  line: makeLine({
                    id: 'line-3',
                    planId: 'plan-closed',
                    closedOn: '2026-11-10',
                    closedReason: 'REMOVED',
                  }),
                  seatsToday: 0,
                  isServing: false,
                },
              ],
            ],
          ]),
        ),
      } as unknown as SubscriptionLotResponsibleService,
      {
        findMany: jest.fn().mockResolvedValue([]),
        workingAdminsAmong: jest.fn().mockResolvedValue(new Set()),
      } as unknown as WorkspaceForSubscriptionService,
    );

    const [k2View, k1View] = await service.viewAll([k2, k1]);

    expect(k2View.purchasedQuantity).toBe(12);
    expect(k2View.lineCount).toBe(3);
    expect(k2View.seatsToday).toBe(12);
    expect(k2View.seats).toEqual({ purchased: 12, assigned: 3, free: 9, inRevocation: 0 });
    expect(k2View.lines).toEqual([
      {
        id: 'line-1',
        plan: { id: 'plan-1', name: 'FigJam' },
        monthlyUnitPrice: { amount: '375000', currency: 'VND' },
        minimumSeats: 2,
        seatsToday: 5,
        assignedToday: 2,
        freeToday: 3,
        closedOn: null,
        closedReason: null,
      },
      {
        id: 'line-2',
        plan: { id: 'plan-2', name: 'Figma Design' },
        monthlyUnitPrice: { amount: '375000', currency: 'VND' },
        minimumSeats: 2,
        seatsToday: 7,
        assignedToday: 1,
        freeToday: 6,
        closedOn: null,
        closedReason: null,
      },
      {
        id: 'line-3',
        plan: { id: 'plan-closed', name: 'Slides' },
        monthlyUnitPrice: { amount: '375000', currency: 'VND' },
        minimumSeats: 2,
        seatsToday: 0,
        assignedToday: 0,
        freeToday: 0,
        closedOn: '2026-11-10',
        closedReason: 'REMOVED',
      },
    ]);
    expect(k1View.seats).toBeNull();
    expect(k1View.lines).toEqual([]);
    expect(k1View.lineCount).toBe(0);
    expect(k1View.seatsToday).toBe(0);
  });

  it('H-9(b): keeps record.purchasedQuantity = null and missing = [QUANTITY] for a DRAFT K2 PER_SEAT subscription with an un-opened line', async () => {
    const draftK2 = makeRecord({
      id: 'sub-draft',
      status: 'DRAFT',
      purchasedQuantity: null,
      unitPrice: { amountMinor: 375_000n, currency: 'VND', recordedOn: '2026-11-01' },
      monthlyUnitPriceMinor: 375_000n,
      priceSnapshot: {
        rate: 1n,
        rateDate: '2026-11-01',
        rateSource: 'SAME_CURRENCY',
        reportingMinor: 375_000n,
        reportingCurrency: 'VND',
        exchangeRateId: null,
      },
    });
    const service = new SubscriptionViewService(
      {
        findCurrency: jest.fn().mockResolvedValue({ code: 'VND', minorUnit: 0 }),
        taxProfileGroups: jest.fn().mockResolvedValue(new Map()),
        estimateTaxMany: jest.fn().mockResolvedValue([
          {
            basis: 'NO_PROFILE',
            group: null,
            taxMinor: 0n,
            deductibleMinor: 0n,
            nonDeductibleMinor: 0n,
            estimatedCostMinor: 375_000n,
          },
        ]),
      } as unknown as FinanceApi,
      {
        businessToday: jest.fn().mockResolvedValue('2026-11-15'),
        getEmployees: jest.fn().mockResolvedValue([]),
      } as unknown as OrganizationReadApi,
      {
        vendorAdminsOf: jest.fn().mockResolvedValue(new Map()),
        workingAdminsAmong: jest.fn(),
        lookups: jest.fn().mockResolvedValue([{ id: 'plan-1', name: 'FigJam' }]),
      } as unknown as PlanFactsService,
      {
        get: () => ({
          seatsAndPlansOfSubscriptions: jest
            .fn()
            .mockResolvedValue({ bySubscription: new Map(), bySubscriptionPlan: new Map() }),
        }),
      } as unknown as SeatOccupancyHook,
      { idsWithSuccessor: jest.fn().mockResolvedValue(new Set()) } as unknown as SubscriptionGrantingRepo,
      { of: jest.fn().mockResolvedValue(new Map()) } as unknown as SubscriptionWindowsService,
      {
        withLines: jest.fn().mockResolvedValue(new Set(['sub-draft'])),
        lotResponsibles: jest.fn().mockResolvedValue(new Map()),
        linesForSubscriptions: jest.fn().mockResolvedValue(
          new Map([
            [
              'sub-draft',
              [
                {
                  line: makeLine({ subscriptionId: 'sub-draft', ledgerOpenedOn: null }),
                  seatsToday: 0,
                  isServing: false,
                },
              ],
            ],
          ]),
        ),
      } as unknown as SubscriptionLotResponsibleService,
      {
        findMany: jest.fn().mockResolvedValue([]),
        workingAdminsAmong: jest.fn().mockResolvedValue(new Set()),
      } as unknown as WorkspaceForSubscriptionService,
    );

    const [view] = await service.viewAll([draftK2]);
    expect(view.purchasedQuantity).toBeNull();
    expect(view.missing).toEqual(['QUANTITY']);
  });
});
