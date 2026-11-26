import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PurchaseInvoiceRefusedError } from './purchase-invoice.errors';
import { PurchaseInvoicePlanService } from './purchase-invoice-plan.service';

const tx = {} as DbTx;
const actor = { employeeId: 'it-1' } as unknown as AuthenticatedPrincipal;

describe('PurchaseInvoicePlanService acting scope (S2-2)', () => {
  it('checks request department against getItAdminActingScope', async () => {
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(['it-1']));
    const getItAdminActingScope = jest.fn(
      async (_id: string, usable: (ids: readonly string[]) => Promise<ReadonlySet<string>>) => {
        await usable(['it-1']);
        return ['dept-other'];
      },
    );
    const service = new PurchaseInvoicePlanService(
      {
        requestFacts: jest
          .fn()
          .mockResolvedValue({ departmentId: 'dept-1', state: 'AWAITING_EXECUTION', planId: 'plan-1' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getItAdminActingScope } as never,
      { findUsableItAdminEmployeeIds } as never,
      {} as never,
    );

    await expect(
      service.plan(
        actor,
        {
          link: { requestId: 'req-1' },
          servicePeriodMonth: '2026-11',
        } as never,
        tx,
      ),
    ).rejects.toEqual(new PurchaseInvoiceRefusedError('LINK_NOT_FOUND'));

    expect(getItAdminActingScope).toHaveBeenCalledWith('it-1', expect.any(Function), tx);
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1'], tx);
  });

  it('rejects REQUEST link for K2 when request has seat purchases with SEAT_PURCHASE_REQUIRED', async () => {
    const service = new PurchaseInvoicePlanService(
      {
        requestFacts: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          departmentId: 'dept-1',
          state: 'AWAITING_EXECUTION',
          planId: 'plan-1',
          type: 'GRANT',
        }),
      } as never,
      {
        getPlanVendorId: jest.fn().mockResolvedValue('vendor-1'),
        findPlanSeatTargets: jest.fn().mockResolvedValue([{ planId: 'plan-1', provisioningType: 'K2' }]),
      } as never,
      {
        topUpPurchaseIdsOfRequest: jest.fn().mockResolvedValue(['purchase-1']),
      } as never,
      {} as never,
      {} as never,
      { getItAdminActingScope: jest.fn().mockResolvedValue(['dept-1']) } as never,
      { findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['it-1'])) } as never,
      {} as never,
    );

    let caught: unknown;
    try {
      await service.plan(
        actor,
        {
          link: { requestId: 'req-1' },
          servicePeriodMonth: '2026-11',
          netAmount: { amount: '500000' },
          unitPriceOriginal: { amount: '500000', currency: 'VND' },
          quantity: 1,
        } as never,
        tx,
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(PurchaseInvoiceRefusedError);
    expect((caught as PurchaseInvoiceRefusedError).reason).toBe('SEAT_PURCHASE_REQUIRED');
    expect((caught as PurchaseInvoiceRefusedError).seatPurchaseIds).toEqual(['purchase-1']);
  });

  it('rejects SUBSCRIPTION link with subscriptionLineIds when any line is already invoiced for that serviceMonth', async () => {
    const service = new PurchaseInvoicePlanService(
      {
        invoicedLinesForMonth: jest
          .fn()
          .mockResolvedValue({ wholePeriodInvoiced: false, lineIds: new Set(['line-1']) }),
      } as never,
      {
        getPlanVendorId: jest.fn().mockResolvedValue('vendor-1'),
        getSubscriptionOriginalPrice: jest.fn().mockResolvedValue(null),
      } as never,
      {
        getPurchaseFacts: jest.fn().mockResolvedValue([
          {
            subscriptionId: 'sub-1',
            planId: 'plan-1',
            provisioningType: 'K2',
            billingCycle: 'ANNUAL',
            purchasedQuantity: 10,
            monthlyPriceMinor: 500_000n,
            cycleMonths: 12,
            startDate: '2026-07-01',
            endDate: '2027-06-30',
            renewalDate: '2027-07-01',
            invoicedLater: false,
          },
        ]),
        linesOfSubscription: jest
          .fn()
          .mockResolvedValue([
            { id: 'line-1', subscriptionId: 'sub-1', monthlyUnitPriceMinor: 500_000n, closedReason: null },
          ]),
      } as never,
      {} as never,
      {} as never,
      {
        getItAdminActingScope: jest.fn().mockResolvedValue([]),
        getOrganization: jest.fn().mockResolvedValue({ id: 'org-1', timeZone: 'Asia/Ho_Chi_Minh' }),
      } as never,
      { findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set()) } as never,
      {} as never,
    );

    let caught: unknown;
    try {
      await service.plan(
        actor,
        {
          link: { subscriptionId: 'sub-1', subscriptionLineIds: ['line-1'] },
          servicePeriodMonth: '2026-11',
          netAmount: { amount: '500000' },
          unitPriceOriginal: { amount: '500000', currency: 'VND' },
          quantity: 10,
        } as never,
        tx,
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(PurchaseInvoiceRefusedError);
    expect((caught as PurchaseInvoiceRefusedError).reason).toBe('LINE_ALREADY_INVOICED');
  });

  it('rejects LICENSE_LOT link with LOT_ALREADY_INVOICED when invoiceActualMinor is already set (F14a)', async () => {
    const findLot = jest.fn<Promise<{ id: string; invoiceActualMinor: bigint | null }>, [string]>().mockResolvedValue({
      id: 'lot-1',
      invoiceActualMinor: 36_000_000n,
    });
    const service = new PurchaseInvoicePlanService(
      {
        requestFacts: jest.fn().mockResolvedValue({ departmentId: 'dept-1', costCenterId: 'cc-1' }),
      } as never,
      { getPlanVendorId: jest.fn().mockResolvedValue('vendor-1') } as never,
      {
        buildLicenseLotLinkFacts: async (deps: { licenseLotId: string; scope: readonly string[] }) => {
          const lot = await findLot(deps.licenseLotId);
          if (lot.invoiceActualMinor !== null) throw new PurchaseInvoiceRefusedError('LOT_ALREADY_INVOICED');
          return {};
        },
      } as never,
      {} as never,
      {} as never,
      { getItAdminActingScope: jest.fn().mockResolvedValue(['dept-1']) } as never,
      { findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['it-1'])) } as never,
      {} as never,
    );

    await expect(
      service.plan(
        actor,
        {
          link: { licenseLotId: 'lot-1' },
          servicePeriodMonth: '2027-04',
        } as never,
        tx,
      ),
    ).rejects.toMatchObject({
      constructor: PurchaseInvoiceRefusedError,
      reason: 'LOT_ALREADY_INVOICED',
    });
  });
});
