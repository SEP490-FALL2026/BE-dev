import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { LicenseLotApi } from '../../catalog/public/license-lot.api';
import type { LicenseLotView } from '../../catalog/public/license-lot.types';
import type { CommitmentRepo, LockedCommitmentOfRequest } from '../budget/commitment.repo';
import type { InvoiceRepo } from '../budget/invoice.repo';
import { PurchaseInvoiceRecordRefusedError } from '../public/budgets.errors';
import type { LicenseLotChargeRepo } from '../shared-pool-line/license-lot-charge.repo';
import type { ThresholdAlertService } from '../threshold/threshold-alert.service';
import type { InvoiceAllocationRepo } from './invoice-allocation.repo';
import type { InvoiceYearApplicationRepo } from './invoice-year-application.repo';
import { LicenseLotInvoiceLedgerService } from './license-lot-invoice-ledger.service';
import { LicenseLotInvoiceService } from './license-lot-invoice.service';

const M = 1_000_000n;
const tx = {} as DbTx;
const actor: AuthenticatedPrincipal = {
  subject: 'user-fin',
  sessionId: 'sess-fin',
  employeeId: 'emp-fin',
  appUserId: 'user-fin',
  directRoles: ['FINANCE'],
  roles: ['FINANCE'],
};

const makeLot = (extra: Partial<LicenseLotView> = {}): LicenseLotView => ({
  id: 'lot-1',
  organizationId: 'org-1',
  purchasedOn: '2027-04-01',
  licenseCount: 3,
  unitPriceMinor: 12n * M,
  purpose: 'REQUEST',
  requestId: 'req-duc',
  invoiceActualMinor: null,
  workspaceId: null,
  contractId: null,
  responsibleItAdminEmployeeId: 'it-1',
  legacySubscriptionId: null,
  planId: 'plan-1',
  planName: 'CAD',
  applicationId: 'app-1',
  applicationName: 'AutoCAD',
  applicationKind: 'LICENSED',
  keyBinding: 'ACCOUNT',
  applicationStatus: 'APPROVED',
  updatedAt: new Date('2027-04-01T00:00:00Z'),
  ...extra,
});

const makeCommitment = (extra: Partial<LockedCommitmentOfRequest> = {}): LockedCommitmentOfRequest => ({
  id: 'comm-1',
  organizationId: 'org-1',
  year: 2027,
  costCenterId: 'cc-tech',
  amountMinor: 12n * M,
  releasedMinor: 0n,
  appliedMinor: 0n,
  seatMonthlyMinor: null,
  state: 'HELD',
  origin: 'APPROVAL',
  attachedVersionId: 'ver-1',
  ...extra,
});

describe('LicenseLotInvoiceService', () => {
  const setup = () => {
    const lots = {
      lockLot: jest.fn().mockResolvedValue(makeLot()),
      setInvoiceActual: jest.fn().mockResolvedValue(undefined),
    };
    const lotCharges = { ofLot: jest.fn().mockResolvedValue([]), lotInvoiceSummary: jest.fn().mockResolvedValue(null) };
    const commitments = {
      lockOfRequest: jest.fn().mockResolvedValue([makeCommitment()]),
      applyInvoice: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue({ released: true, heldMinor: 0n }),
    };
    const yearLock = { lock: jest.fn().mockResolvedValue(undefined) };
    const invoices = {
      exists: jest.fn().mockResolvedValue(false),
      insert: jest.fn().mockResolvedValue({ id: 'inv-1' }),
    };
    const allocations = { insertMany: jest.fn().mockResolvedValue([]) };
    const yearApplications = { insert: jest.fn().mockResolvedValue({ id: 'app-1' }) };
    const thresholds = { watch: jest.fn().mockResolvedValue(null), settle: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const ledger = new LicenseLotInvoiceLedgerService(
      commitments as unknown as CommitmentRepo,
      yearLock,
      invoices as unknown as InvoiceRepo,
      allocations as unknown as InvoiceAllocationRepo,
      yearApplications as unknown as InvoiceYearApplicationRepo,
      thresholds as unknown as ThresholdAlertService,
      audit as unknown as AuditApi,
    );
    const service = new LicenseLotInvoiceService(
      lots as unknown as LicenseLotApi,
      lotCharges as unknown as LicenseLotChargeRepo,
      ledger,
    );

    return { service, lots, lotCharges, commitments, allocations, yearApplications };
  };

  it('rejects duplicate invoice on an already-invoiced lot (F14a)', async () => {
    const { service, lots } = setup();
    lots.lockLot.mockResolvedValue(makeLot({ invoiceActualMinor: 36n * M }));

    await expect(
      service.recordLotInvoiceConfirmation(tx, actor, {
        organizationId: 'org-1',
        purchaseInvoiceId: 'pi-2',
        requestId: null,
        subscriptionId: null,
        licenseLotId: 'lot-1',
        vendorId: 'v-1',
        number: 'INV-2',
        issuedOn: '2027-04-26',
        serviceMonth: '2027-04-01',
        netMinor: 36n * M,
        deductibleTaxMinor: 0n,
        nonDeductibleTaxMinor: 0n,
        matchResult: 'MATCHED',
        chargedCostCenterId: null,
        unallocated: null,
        lotBeneficiaryCount: 1,
        now: new Date('2027-04-26T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ constructor: PurchaseInvoiceRecordRefusedError, reason: 'LOT_ALREADY_INVOICED' });
  });

  it('confirms REQUEST lot with non-deductible VAT, writes COST_CENTER + POOL_IDLE + tax variance, and sets invoiceActualMinor', async () => {
    const { service, lots, commitments, allocations, yearApplications } = setup();

    const recorded = await service.recordLotInvoiceConfirmation(tx, actor, {
      organizationId: 'org-1',
      purchaseInvoiceId: 'pi-1',
      requestId: 'req-duc',
      subscriptionId: null,
      licenseLotId: 'lot-1',
      vendorId: 'v-1',
      number: 'INV-1',
      issuedOn: '2027-04-25',
      serviceMonth: '2027-04-01',
      allocationMonth: '2027-04-01',
      netMinor: 36n * M,
      deductibleTaxMinor: 0n,
      nonDeductibleTaxMinor: 3_600_000n,
      matchResult: 'MATCHED',
      chargedCostCenterId: 'cc-tech',
      unallocated: null,
      lotBeneficiaryCount: 1,
      now: new Date('2027-04-25T10:00:00Z'),
    });

    expect(recorded).toMatchObject({
      invoiceId: 'inv-1',
      booking: 'COMMITMENT',
      actualCostMinor: 39_600_000n,
      appliedMinor: 12n * M,
    });
    expect(commitments.applyInvoice).toHaveBeenCalledWith(tx, expect.anything(), {
      takeMinor: 12n * M,
      stateAfter: 'EXPENSED',
    });
    expect(allocations.insertMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        invoiceId: 'inv-1',
        month: '2027-04-01',
        bucket: 'COST_CENTER',
        costCenterId: 'cc-tech',
        amountMinor: 13_200_000n,
        kind: 'ORIGINAL',
      }),
      expect.objectContaining({
        invoiceId: 'inv-1',
        month: '2027-04-01',
        bucket: 'POOL_IDLE',
        amountMinor: 26_400_000n,
        kind: 'ORIGINAL',
      }),
    ]);
    expect(yearApplications.insert).toHaveBeenCalledWith(tx, {
      invoiceId: 'inv-1',
      year: 2027,
      costCenterId: 'cc-tech',
      commitmentId: 'comm-1',
      source: 'CONFIRMATION',
      appliedMinor: 12n * M,
      taxVarianceMinor: 1_200_000n,
    });
    expect(lots.setInvoiceActual).toHaveBeenCalledWith(tx, 'lot-1', 39_600_000n);
  });

  it('F13c + D-16: writes WITHDRAWAL allocations and skips UPDATE budget_commitments when commitment is EXPENSED', async () => {
    const { service, lots, lotCharges, commitments, allocations, yearApplications } = setup();
    lots.lockLot.mockResolvedValue(makeLot({ invoiceActualMinor: 36n * M, unitPriceMinor: 12n * M }));
    lotCharges.lotInvoiceSummary.mockResolvedValue({
      invoiceId: 'inv-1',
      recordedAt: new Date('2027-04-25T00:00:00Z'),
      costCenterAllocatedMinor: 24n * M,
    });
    commitments.lockOfRequest.mockResolvedValue([
      makeCommitment({ state: 'EXPENSED', amountMinor: 24n * M, appliedMinor: 24n * M }),
    ]);

    await service.recordLotWithdrawalAfterInvoice(tx, {
      licenseLotId: 'lot-1',
      requestId: 'req-group',
      costCenterId: 'cc-tech',
      withdrawalMonth: '2027-05-01',
      reference: 'withdraw:an',
      now: new Date('2027-05-02T00:00:00Z'),
    });

    expect(commitments.release).not.toHaveBeenCalled();
    expect(allocations.insertMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        invoiceId: 'inv-1',
        month: '2027-05-01',
        bucket: 'COST_CENTER',
        costCenterId: 'cc-tech',
        amountMinor: -12n * M,
        kind: 'WITHDRAWAL',
      }),
      expect.objectContaining({
        invoiceId: 'inv-1',
        month: '2027-05-01',
        bucket: 'POOL_IDLE',
        amountMinor: 12n * M,
        kind: 'WITHDRAWAL',
      }),
    ]);
    expect(yearApplications.insert).toHaveBeenCalledWith(tx, {
      invoiceId: 'inv-1',
      year: 2027,
      costCenterId: 'cc-tech',
      commitmentId: 'comm-1',
      source: 'WITHDRAWAL',
      appliedMinor: -12n * M,
      taxVarianceMinor: 0n,
    });
  });

  it('T-9: confirms STOCK + ACCOUNT lot into POOL_IDLE and STOCK + DEVICE_KEY lot into POOL_DEVICE_LOT', async () => {
    const accountCtx = setup();
    accountCtx.lots.lockLot.mockResolvedValue(makeLot({ purpose: 'STOCK', keyBinding: 'ACCOUNT', requestId: null }));
    await accountCtx.service.recordLotInvoiceConfirmation(tx, actor, {
      organizationId: 'org-1',
      purchaseInvoiceId: 'pi-acc',
      requestId: null,
      subscriptionId: null,
      licenseLotId: 'lot-1',
      vendorId: 'v-1',
      number: 'INV-STOCK-ACC',
      issuedOn: '2027-05-10',
      serviceMonth: '2027-05-01',
      allocationMonth: '2027-05-01',
      netMinor: 18n * M,
      deductibleTaxMinor: 0n,
      nonDeductibleTaxMinor: 0n,
      matchResult: 'MATCHED',
      chargedCostCenterId: null,
      unallocated: null,
      now: new Date('2027-05-10T10:00:00Z'),
    });
    expect(accountCtx.allocations.insertMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({ bucket: 'POOL_IDLE', amountMinor: 18n * M, kind: 'ORIGINAL' }),
    ]);

    const deviceCtx = setup();
    deviceCtx.lots.lockLot.mockResolvedValue(makeLot({ purpose: 'STOCK', keyBinding: 'DEVICE_KEY', requestId: null }));
    await deviceCtx.service.recordLotInvoiceConfirmation(tx, actor, {
      organizationId: 'org-1',
      purchaseInvoiceId: 'pi-dev',
      requestId: null,
      subscriptionId: null,
      licenseLotId: 'lot-1',
      vendorId: 'v-1',
      number: 'INV-STOCK-DEV',
      issuedOn: '2027-05-10',
      serviceMonth: '2027-05-01',
      allocationMonth: '2027-05-01',
      netMinor: 20n * M,
      deductibleTaxMinor: 0n,
      nonDeductibleTaxMinor: 0n,
      matchResult: 'MATCHED',
      chargedCostCenterId: null,
      unallocated: null,
      now: new Date('2027-05-10T10:00:00Z'),
    });
    expect(deviceCtx.allocations.insertMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({ bucket: 'POOL_DEVICE_LOT', amountMinor: 20n * M, kind: 'ORIGINAL' }),
    ]);
  });
});
