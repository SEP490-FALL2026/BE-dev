import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicenseLotApi } from '../../catalog/public/license-lot.api';
import { LicenseLotAlreadyInvoicedError } from '../../catalog/public/catalog.errors';
import { PurchaseInvoiceRecordRefusedError } from '../public/budgets.errors';
import type {
  LotWithdrawalAfterInvoiceInput,
  PurchaseInvoiceRecordInput,
  PurchaseInvoiceRecorded,
} from '../public/budgets.types';
import { LicenseLotChargeRepo } from '../shared-pool-line/license-lot-charge.repo';
import { planLotWithdrawalAfterInvoice } from '../shared-pool-line/license-lot-cost.policy';
import { LicenseLotInvoiceLedgerService } from './license-lot-invoice-ledger.service';

@Injectable()
export class LicenseLotInvoiceService {
  constructor(
    private readonly lots: LicenseLotApi,
    private readonly lotCharges: LicenseLotChargeRepo,
    private readonly ledger: LicenseLotInvoiceLedgerService,
  ) {}

  /**
   * Records a `LICENSE_LOT` invoice confirmation (`REQUEST`, `STOCK`, `REPLACEMENT`): allocates CC vs pool buckets,
   * stamps `invoice_actual_minor` atomically (`F14a`), or returns `null` when purpose is `OPENING` so standard flow runs.
   */
  async recordLotInvoiceConfirmation(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
  ): Promise<PurchaseInvoiceRecorded | null> {
    if (!input.licenseLotId) return null;
    const lot = await this.lots.lockLot(tx, input.licenseLotId);
    if (!lot) throw new PurchaseInvoiceRecordRefusedError('NO_PLACE');
    if (lot.invoiceActualMinor !== null) throw new PurchaseInvoiceRecordRefusedError('LOT_ALREADY_INVOICED');
    if (lot.purpose === 'OPENING') return null;

    if (await this.ledger.invoiceExists(tx, input.organizationId, input.vendorId, input.number)) {
      throw new PurchaseInvoiceRecordRefusedError('DUPLICATE_NUMBER');
    }

    const actualCostMinor = input.netMinor + input.nonDeductibleTaxMinor;
    const allocationMonth = input.allocationMonth ?? input.serviceMonth;
    const matchResult = resolveLotMatchResult(input);
    const stampLotActual = () => this.stampLotActual(tx, lot.id, actualCostMinor);

    if (lot.purpose === 'STOCK' || lot.purpose === 'REPLACEMENT') {
      return this.ledger.persistPoolOnlyLotInvoice(
        tx,
        actor,
        input,
        lot,
        { actualCostMinor, allocationMonth, matchResult },
        stampLotActual,
      );
    }

    const preCharges = await this.lotCharges.ofLot(lot.id, tx);

    return this.ledger.persistRequestLotInvoice(
      tx,
      actor,
      input,
      lot,
      { actualCostMinor, allocationMonth, matchResult },
      {
        preInvoiceChargedCount: preCharges.length,
        preInvoiceChargedSumMinor: preCharges.reduce((sum, item) => sum + item.amountMinor, 0n),
        stampLotActual,
      },
    );
  }

  /**
   * Compensates a confirmed `REQUEST` lot invoice when a group beneficiary withdraws after confirmation (`F13c`):
   * appends `WITHDRAWAL -u` (`COST_CENTER`) and `WITHDRAWAL +u` (`POOL_IDLE`), records `invoice_year_applications`,
   * releases commitment if `HELD`, or skips `UPDATE budget_commitments` when `EXPENSED` (`D-16`).
   */
  async recordLotWithdrawalAfterInvoice(tx: DbTx, input: LotWithdrawalAfterInvoiceInput): Promise<void> {
    const lot = await this.lots.lockLot(tx, input.licenseLotId);
    if (!lot || lot.invoiceActualMinor === null) return;
    const summary = await this.lotCharges.lotInvoiceSummary(tx, lot.id);
    if (!summary) return;

    const withdrawalYear = Number(input.withdrawalMonth.slice(0, 4));
    const commitment = await this.ledger.findActiveCommitment(tx, input.requestId, withdrawalYear);
    const plan = planLotWithdrawalAfterInvoice({
      invoiceActualMinor: lot.invoiceActualMinor,
      licenseCount: lot.licenseCount,
      commitmentState: commitment?.state ?? null,
    });

    if (commitment && plan.commitmentAction === 'RELEASE_HELD') {
      await this.ledger.releaseHeldWithdrawal(tx, commitment, plan.unitCostActualMinor, input.reference, input.now);
    }
    // D-16: budget_commitments_guard() forbids UPDATE on EXPENSED commitments; keep commitment immutable
    // and rely on invoice_allocations WITHDRAWAL (-u COST_CENTER / +u POOL_IDLE) and invoice_year_applications (-u).
    await this.ledger.recordWithdrawalAllocations(tx, {
      invoiceId: summary.invoiceId,
      commitmentId: commitment?.id ?? null,
      withdrawalYear,
      unitCostActualMinor: plan.unitCostActualMinor,
      month: input.withdrawalMonth,
      costCenterId: input.costCenterId,
      costCenterAdjustmentMinor: plan.costCenterAdjustmentMinor,
      poolIdleAdjustmentMinor: plan.poolIdleAdjustmentMinor,
    });
  }

  private async stampLotActual(tx: DbTx, lotId: string, actualMinor: bigint): Promise<void> {
    try {
      await this.lots.setInvoiceActual(tx, lotId, actualMinor);
    } catch (error) {
      if (error instanceof LicenseLotAlreadyInvoicedError) {
        throw new PurchaseInvoiceRecordRefusedError('LOT_ALREADY_INVOICED');
      }
      throw error;
    }
  }
}

function resolveLotMatchResult(input: PurchaseInvoiceRecordInput): PurchaseInvoiceRecorded['matchResult'] {
  if (input.matchResult === 'PRICE_QUANTITY_EXCEPTION') return 'PRICE_QUANTITY_EXCEPTION';

  return input.deductibleTaxMinor > 0n || input.nonDeductibleTaxMinor > 0n ? 'TAX_ONLY' : 'MATCHED';
}
