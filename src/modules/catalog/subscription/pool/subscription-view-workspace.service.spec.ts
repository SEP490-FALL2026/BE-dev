import type { FinanceApi } from '../../../finance/public/finance.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { PlanFactsService } from '../../plan/plan-facts.service';
import type { SeatOccupancyHook } from '../../public/catalog.extension-points';
import type { WorkspaceForSubscriptionService } from '../../workspace/workspace-for-subscription.service';
import type { WorkspaceRecord } from '../../workspace/workspace.types';
import type { SubscriptionLotResponsibleService } from '../responsible/subscription-lot-responsible.service';
import type { SubscriptionGrantingRepo } from '../subscription-granting.repo';
import { SubscriptionViewService } from '../subscription-view.service';
import type { SubscriptionRecord } from '../subscription.types';
import type { SubscriptionWindowsService } from '../subscription-windows.service';

describe('SubscriptionViewService: workspace vendor admins and no SHOULD_MERGE (W3-12, W3-14)', () => {
  const baseDate = new Date('2026-11-15T00:00:00.000Z');
  const record = (over: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
    id: 'sub-1',
    planId: 'plan-1',
    planName: 'Claude Pro',
    planPricingModel: 'PER_SEAT',
    planProvisioningType: 'K2',
    planHasAdminConsole: true,
    applicationId: 'app-1',
    applicationName: 'Claude',
    applicationLogoUrl: null,
    applicationKind: 'SAAS',
    vendor: { id: 'v-1', name: 'Anthropic' },
    kind: 'TERM',
    status: 'ACTIVE',
    purchasedQuantity: 10,
    unitPrice: null,
    monthlyUnitPriceMinor: null,
    priceSnapshot: null,
    originalPrice: null,
    billingCycle: 'MONTHLY',
    commitmentTermMonths: 1,
    startDate: '2026-11-01',
    endDate: null,
    renewalDate: '2026-12-01',
    noticeDeadline: null,
    noticePeriodDays: null,
    autoRenew: true,
    allowsMidTermReduction: false,
    responsibleItAdminEmployeeId: 'emp-khoa',
    vendorMinimumSeats: null,
    isPrimaryForPlan: false,
    renewedFromId: null,
    workspace: { id: 'ws-a', name: 'Anthropic' },
    seatCounting: 'FIXED',
    minimumSeatsTotal: null,
    invoicedLater: false,
    createdAt: baseDate,
    updatedAt: baseDate,
    ...over,
  });

  it('reads vendor admins and vendorAdminsBelowMinimum from the workspace of the subscription and emits no SHOULD_MERGE', async () => {
    const ws = {
      id: 'ws-a',
      ownerAccountEmail: 'admin@anthropic.acme.vn',
      adminNote: 'Use SSO',
      admins: [
        { employeeId: 'emp-khoa', role: 'OWNER' as const },
        { employeeId: 'emp-nam', role: 'ADMIN' as const },
      ],
    } as WorkspaceRecord;
    const service = new SubscriptionViewService(
      {
        taxProfileGroups: jest.fn().mockResolvedValue(new Map()),
        estimateTaxMany: jest.fn().mockResolvedValue([]),
      } as unknown as FinanceApi,
      {
        businessToday: jest.fn().mockResolvedValue('2026-11-15'),
        getEmployees: jest.fn().mockResolvedValue([
          { id: 'emp-khoa', employeeCode: 'E-KHOA', fullName: 'Khoa' },
          { id: 'emp-nam', employeeCode: 'E-NAM', fullName: 'Nam' },
        ]),
      } as unknown as OrganizationReadApi,
      {
        vendorAdminsOf: jest.fn().mockResolvedValue(new Map()),
        workingAdminsAmong: jest.fn(),
      } as unknown as PlanFactsService,
      {
        get: () => ({
          seatsOfSubscriptions: jest.fn().mockResolvedValue(new Map()),
          occupiedBySubscriptionPlans: jest.fn().mockResolvedValue(new Map()),
        }),
      } as unknown as SeatOccupancyHook,
      { idsWithSuccessor: jest.fn().mockResolvedValue(new Set()) } as unknown as SubscriptionGrantingRepo,
      { of: jest.fn().mockResolvedValue(new Map()) } as unknown as SubscriptionWindowsService,
      {
        withLines: jest.fn().mockResolvedValue(new Set()),
        lotResponsibles: jest.fn().mockResolvedValue(new Map()),
      } as unknown as SubscriptionLotResponsibleService,
      {
        findMany: jest.fn().mockResolvedValue([ws]),
        workingAdminsAmong: jest.fn().mockResolvedValue(new Set(['emp-khoa'])),
      } as unknown as WorkspaceForSubscriptionService,
    );

    const [view] = await service.viewAll([record()]);

    expect(view.vendorAdminsBelowMinimum).toBe(true);
    expect(view.vendorAdmins).toEqual([
      { employeeId: 'emp-khoa', employeeCode: 'E-KHOA', fullName: 'Khoa', role: 'OWNER', working: true },
      { employeeId: 'emp-nam', employeeCode: 'E-NAM', fullName: 'Nam', role: 'ADMIN', working: false },
    ]);
    expect(view.ownerAccountEmail).toBe('admin@anthropic.acme.vn');
    expect(view.warnings).not.toContain('SHOULD_MERGE');
    expect(view.mergeCandidateIds).toEqual([]);
  });
});
