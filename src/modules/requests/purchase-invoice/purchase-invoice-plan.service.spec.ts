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
        getSubscriptionResponsibleItAdmin: jest.fn().mockResolvedValue('it-1'),
        getSubscriptionOriginalPrice: jest.fn().mockResolvedValue(null),
      } as never,
      {
        lockPeriod: jest.fn().mockResolvedValue(null),
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

  it('F-9: locks subscription period before checking invoicedLinesForMonth in tx and rejects whole-period invoice when any line is already invoiced (details.lineIds)', async () => {
    const order: string[] = [];
    const lockPeriod = jest.fn(() => {
      order.push('lockPeriod');
      return Promise.resolve(null);
    });
    const invoicedLinesForMonth = jest.fn(() => {
      order.push('invoicedLinesForMonth');
      return Promise.resolve({ wholePeriodInvoiced: false, lineIds: new Set(['line-standard']) });
    });
    const service = new PurchaseInvoicePlanService(
      { invoicedLinesForMonth } as never,
      {
        getPlanVendorId: jest.fn().mockResolvedValue('vendor-1'),
        getSubscriptionResponsibleItAdmin: jest.fn().mockResolvedValue('it-1'),
        getSubscriptionOriginalPrice: jest.fn().mockResolvedValue(null),
      } as never,
      {
        lockPeriod,
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
        linesOfSubscription: jest.fn().mockResolvedValue([
          { id: 'line-standard', subscriptionId: 'sub-1', monthlyUnitPriceMinor: 500_000n, closedReason: null },
          { id: 'line-premium', subscriptionId: 'sub-1', monthlyUnitPriceMinor: 800_000n, closedReason: null },
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
          link: { subscriptionId: 'sub-1' },
          servicePeriodMonth: '2026-11',
          netAmount: { amount: '1300000' },
          unitPriceOriginal: { amount: '1300000', currency: 'VND' },
          quantity: 10,
        } as never,
        tx,
      );
    } catch (e) {
      caught = e;
    }

    expect(lockPeriod).toHaveBeenCalledWith(tx, 'sub-1');
    expect(order).toEqual(['lockPeriod', 'invoicedLinesForMonth']);
    expect(caught).toBeInstanceOf(PurchaseInvoiceRefusedError);
    expect((caught as PurchaseInvoiceRefusedError).reason).toBe('LINE_ALREADY_INVOICED');
    expect((caught as PurchaseInvoiceRefusedError).lineIds).toEqual(['line-standard']);
  });

  it('F-9: skips lockPeriod on read-only preview (no tx) and allows whole-period preview when wholePeriodInvoiced has no split lines', async () => {
    const lockPeriod = jest.fn();
    const service = new PurchaseInvoicePlanService(
      {
        invoicedLinesForMonth: jest.fn().mockResolvedValue({ wholePeriodInvoiced: true, lineIds: new Set() }),
        earlierOf: jest.fn().mockResolvedValue({ count: 1, earliestServiceMonth: '2026-10-01' }),
      } as never,
      {
        getPlanVendorId: jest.fn().mockResolvedValue('vendor-1'),
        getSubscriptionResponsibleItAdmin: jest.fn().mockResolvedValue('it-1'),
        getSubscriptionOriginalPrice: jest.fn().mockResolvedValue(null),
      } as never,
      {
        lockPeriod,
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
            { id: 'line-std', subscriptionId: 'sub-1', monthlyUnitPriceMinor: 500_000n, closedReason: null },
          ]),
        subscriptionSource: jest.fn().mockResolvedValue({
          kind: 'LINES',
          seatsByDay: new Map(),
          totalSeats: 10,
          monthlyPriceMinor: 500_000n,
          expectedNetMinor: 5_000_000n,
        }),
        seatPricingOf: jest
          .fn()
          .mockResolvedValue({ monthlyMinor: 500_000n, cycleMonths: 12, renewalDate: '2027-07-01' }),
        ceilingPartsOf: jest
          .fn()
          .mockResolvedValue([
            { quantity: 10, pricing: { monthlyMinor: 500_000n, cycleMonths: 12, renewalDate: '2027-07-01' } },
          ]),
        isPoolExpectedMissing: jest.fn().mockResolvedValue(false),
      } as never,
      {} as never,
      {} as never,
      {
        getItAdminActingScope: jest.fn().mockResolvedValue([]),
        getOrganization: jest.fn().mockResolvedValue({ id: 'org-1', timeZone: 'Asia/Ho_Chi_Minh' }),
      } as never,
      { findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set()) } as never,
      {
        parseMoney: jest.fn((m: { amount: string; currency: string }) =>
          Promise.resolve({ amountMinor: BigInt(m.amount), currency: m.currency }),
        ),
      } as never,
    );

    const planned = await service.plan(actor, {
      link: { subscriptionId: 'sub-1' },
      servicePeriodMonth: '2026-11',
      netAmount: { amount: '5000000' },
      unitPriceOriginal: { amount: '500000', currency: 'VND' },
      quantity: 10,
    } as never);

    expect(lockPeriod).not.toHaveBeenCalled();
    expect(planned.link).toEqual({
      kind: 'SUBSCRIPTION',
      subscriptionId: 'sub-1',
      seatPurchaseId: null,
      subscriptionLineIds: [],
    });
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

  it('F-18: lotConfirmationContextOf locks lot (tier 6a) BEFORE reading activeBeneficiaryCount (m)', async () => {
    const order: string[] = [];
    const lot = { id: 'lot-1', purpose: 'REQUEST', requestId: 'req-1' };
    const findLot = jest.fn().mockImplementation(() => {
      order.push('findLot');
      return Promise.resolve(lot);
    });
    const lockLot = jest.fn().mockImplementation(() => {
      order.push('lockLot');
      return Promise.resolve(lot);
    });
    const activeBeneficiaryCount = jest.fn().mockImplementation(() => {
      order.push('activeBeneficiaryCount');
      return Promise.resolve(2);
    });

    const service = new PurchaseInvoicePlanService(
      { activeBeneficiaryCount } as never,
      {} as never,
      { findLot, findLotOfRequest: jest.fn(), lockLot } as never,
      {} as never,
      {} as never,
      { getOrganization: jest.fn().mockResolvedValue({ timeZone: 'Asia/Ho_Chi_Minh' }) } as never,
      {} as never,
      {} as never,
    );

    const ctx = await service.lotConfirmationContextOf(
      { linkKind: 'LICENSE_LOT', licenseLotId: 'lot-1', requestId: null },
      new Date('2027-04-15T00:00:00Z'),
      tx,
    );

    expect(lockLot).toHaveBeenCalledWith('lot-1', tx);
    expect(activeBeneficiaryCount).toHaveBeenCalledWith('req-1', tx);
    expect(order.indexOf('lockLot')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('lockLot')).toBeLessThan(order.indexOf('activeBeneficiaryCount'));
    expect(ctx).toEqual({ licenseLotId: 'lot-1', allocationMonth: '2027-04-01', lotBeneficiaryCount: 2 });
  });
});
