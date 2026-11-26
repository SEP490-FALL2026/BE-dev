import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { LicenseLotApi } from '../../catalog/public/license-lot.api';
import type { LicenseLotView } from '../../catalog/public/license-lot.types';
import type { CommitmentRepo, LockedCommitmentOfRequest } from '../budget/commitment.repo';
import type { CommitmentRequestFactsHook } from '../public/budgets.extension-points';
import type { LicenseLotChargeRepo } from './license-lot-charge.repo';
import { LicenseLotCostService } from './license-lot-cost.service';

const M = 1_000_000n;
const tx = {} as DbTx;

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

describe('LicenseLotCostService', () => {
  const setup = () => {
    const lots = {
      lockLot: jest.fn().mockResolvedValue(makeLot()),
      findLotsByIds: jest.fn().mockResolvedValue(new Map()),
    };
    const lotCharges = {
      ofLot: jest.fn().mockResolvedValue([]),
      ofLots: jest.fn().mockResolvedValue([]),
      insertOnce: jest.fn().mockResolvedValue(true),
      lotInvoiceSummary: jest.fn().mockResolvedValue(null),
      poolTotalsInRange: jest
        .fn()
        .mockResolvedValue({ lotIdleNetMinor: 0n, deviceLotPurchasesMinor: 0n, replacementKeysMinor: 0n }),
      invoicedLotIdsInMonth: jest.fn().mockResolvedValue([]),
    };
    const commitments = {
      lockOfRequest: jest.fn().mockResolvedValue([makeCommitment()]),
      applyInvoice: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue({ released: true, heldMinor: 0n }),
    };
    const requestFacts = {
      isBound: jest.fn().mockReturnValue(true),
      get: jest.fn().mockReturnValue({ factsOf: jest.fn().mockResolvedValue(new Map()) }),
    };
    const service = new LicenseLotCostService(
      lots as unknown as LicenseLotApi,
      lotCharges as unknown as LicenseLotChargeRepo,
      commitments as unknown as CommitmentRepo,
      requestFacts as unknown as CommitmentRequestFactsHook,
    );

    return { service, lots, lotCharges, commitments };
  };

  it('keeps F10 own-request grant uncharged with commitment held, and applies post-invoice excess grant charge', async () => {
    const { service, lots, lotCharges, commitments } = setup();

    const ownResult = await service.recordExcessLicenseGrant(tx, {
      organizationId: 'org-1',
      licenseLotId: 'lot-1',
      licenseKeyId: 'key-1',
      grantRequestId: 'req-duc',
      costCenterId: 'cc-tech',
      keyCostBorneBeforeGrant: false,
      grantMonth: '2027-04-01',
      effectiveBeneficiaryCount: 1,
      reference: 'grant:1',
      now: new Date('2027-04-10T00:00:00Z'),
    });
    expect(ownResult.kind).toBe('OWN_REQUEST');
    expect(lotCharges.insertOnce).not.toHaveBeenCalled();
    expect(commitments.release).not.toHaveBeenCalled();

    lots.lockLot.mockResolvedValue(makeLot({ invoiceActualMinor: 10n * M, unitPriceMinor: 3_333_333n }));
    lotCharges.ofLot.mockResolvedValue([
      {
        id: 'chg-1',
        organizationId: 'org-1',
        licenseLotId: 'lot-1',
        licenseKeyId: 'key-ex1',
        commitmentId: 'comm-ex1',
        costCenterId: 'cc-mkt',
        month: '2027-05-01',
        amountMinor: 3_333_333n,
        createdAt: new Date('2027-05-01T00:00:00Z'),
      },
    ]);
    lotCharges.lotInvoiceSummary.mockResolvedValue({
      invoiceId: 'inv-1',
      recordedAt: new Date('2027-04-25T00:00:00Z'),
      costCenterAllocatedMinor: 3_333_333n,
    });
    commitments.lockOfRequest.mockResolvedValue([
      makeCommitment({ id: 'comm-ha', costCenterId: 'cc-sales', amountMinor: 5n * M }),
    ]);

    const ex2 = await service.recordExcessLicenseGrant(tx, {
      organizationId: 'org-1',
      licenseLotId: 'lot-1',
      licenseKeyId: 'key-ex2',
      grantRequestId: 'req-ha',
      costCenterId: 'cc-sales',
      keyCostBorneBeforeGrant: false,
      grantMonth: '2027-06-01',
      effectiveBeneficiaryCount: 1,
      reference: 'grant:3',
      now: new Date('2027-06-01T00:00:00Z'),
    });

    expect(ex2.chargeMinor).toBe(3_333_334n);
    expect(lotCharges.insertOnce).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ licenseKeyId: 'key-ex2', amountMinor: 3_333_334n, costCenterId: 'cc-sales' }),
    );
    expect(commitments.applyInvoice).toHaveBeenCalledWith(tx, expect.anything(), {
      takeMinor: 3_333_334n,
      stateAfter: 'HELD',
    });
    expect(commitments.release).toHaveBeenCalledWith(
      tx,
      expect.anything(),
      expect.objectContaining({ takeMinor: 1_666_666n, reason: 'GRANTED_FROM_POOL' }),
    );
  });

  it('G-4: idleAlertsForMonth fails loudly when CommitmentRequestFactsHook is unbound', async () => {
    const { lots, lotCharges, commitments } = setup();
    lotCharges.invoicedLotIdsInMonth.mockResolvedValue(['lot-1']);
    lots.findLotsByIds = jest.fn().mockResolvedValue(new Map([['lot-1', makeLot()]]));
    const service = new LicenseLotCostService(
      lots as unknown as LicenseLotApi,
      lotCharges as unknown as LicenseLotChargeRepo,
      commitments as unknown as CommitmentRepo,
      {
        isBound: () => false,
        get: () => {
          throw new Error('Extension hook budgets.commitment-request-facts is not bound');
        },
      } as unknown as CommitmentRequestFactsHook,
    );

    await expect(service.idleAlertsForMonth('org-1', '2027-04-01', tx)).rejects.toThrow('not bound');
  });
});
