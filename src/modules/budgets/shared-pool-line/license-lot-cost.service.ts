import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicenseLotApi } from '../../catalog/public/license-lot.api';
import { CommitmentRepo, type LockedCommitmentOfRequest } from '../budget/commitment.repo';
import { CommitmentRequestFactsHook } from '../public/budgets.extension-points';
import type { ExcessLicenseGrantInput, ExcessLicenseGrantRecorded } from '../public/budgets.types';
import { LicenseLotChargeRepo } from './license-lot-charge.repo';
import { lotIdleRatioStats, planLotExcessCharge } from './license-lot-cost.policy';

export interface LotIdleAlertCandidate {
  readonly lotId: string;
  readonly responsibleItAdminEmployeeId: string | null;
  readonly ratioPercent: string;
}

@Injectable()
export class LicenseLotCostService {
  constructor(
    private readonly lots: LicenseLotApi,
    private readonly lotCharges: LicenseLotChargeRepo,
    private readonly commitments: CommitmentRepo,
    private readonly requestFacts: CommitmentRequestFactsHook,
  ) {}

  /**
   * Records commitment / excess-license accounting when a K4 key of `licenseLotId` is granted to `grantRequestId`:
   * own-request (`F10`), already cost-borne reclaim, or new excess license charge (`K-A9`, `F13b`).
   */
  async recordExcessLicenseGrant(tx: DbTx, input: ExcessLicenseGrantInput): Promise<ExcessLicenseGrantRecorded> {
    const lot = await this.lots.lockLot(tx, input.licenseLotId);
    if (!lot) return { kind: 'ALREADY_BORNE', chargeMinor: 0n, markCostBorne: false, releaseCommitmentAll: false };

    const existingCharges = await this.lotCharges.ofLot(lot.id, tx);
    const invoiceSummary = lot.invoiceActualMinor !== null ? await this.lotCharges.lotInvoiceSummary(tx, lot.id) : null;
    const plan = planLotExcessCharge({
      grantRequestId: input.grantRequestId,
      lotRequestId: lot.requestId,
      keyCostBorneBeforeGrant: input.keyCostBorneBeforeGrant,
      licenseCount: lot.licenseCount,
      effectiveBeneficiaryCount: input.effectiveBeneficiaryCount,
      unitPriceMinor: lot.unitPriceMinor,
      invoiceActualMinor: lot.invoiceActualMinor,
      alreadyChargedCount: existingCharges.length,
      alreadyChargedSumMinor: existingCharges.reduce((sum, item) => sum + item.amountMinor, 0n),
      costCenterAllocatedMinor: invoiceSummary?.costCenterAllocatedMinor ?? null,
    });

    if (plan.kind !== 'EXCESS_LICENSE') return plan;

    const grantYear = Number(input.grantMonth.slice(0, 4));
    const held = await this.settleExcessGrantCommitment(tx, input, grantYear, plan.chargeMinor);
    if (plan.chargeMinor > 0n) {
      const createdAt = invoiceSummary
        ? new Date(Math.max(input.now.getTime(), invoiceSummary.recordedAt.getTime() + 1))
        : input.now;
      await this.lotCharges.insertOnce(tx, {
        organizationId: input.organizationId,
        licenseLotId: lot.id,
        licenseKeyId: input.licenseKeyId,
        commitmentId: held?.id ?? null,
        costCenterId: input.costCenterId,
        month: input.grantMonth,
        amountMinor: plan.chargeMinor,
        createdAt,
      });
    }

    return plan;
  }

  /** Counts excess license charges already recorded per lot id (`F11` reservation check). */
  async chargedExcessCountsOfLots(lotIds: readonly string[], tx?: DbTx): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (lotIds.length === 0) return counts;
    for (const charge of await this.lotCharges.ofLots(lotIds, tx)) {
      counts.set(charge.licenseLotId, (counts.get(charge.licenseLotId) ?? 0) + 1);
    }

    return counts;
  }

  /** Aggregates lot shared-pool figures (`POOL_IDLE`, `POOL_LOT_DIFFERENCE`, `POOL_DEVICE_LOT`, `POOL_REPLACEMENT`) in `[from, until)`. */
  poolTotalsInRange(organizationId: string, from: BusinessDate, until: BusinessDate, tx?: DbTx) {
    return this.lotCharges.poolTotalsInRange({ organizationId, from, until }, tx);
  }

  /** Returns `REQUEST` lots invoiced in `month` whose pre-tax idle ratio exceeds 10% (`K-A8`, `F14b`). */
  async idleAlertsForMonth(organizationId: string, month: BusinessDate, tx?: DbTx): Promise<LotIdleAlertCandidate[]> {
    const lotIds = await this.lotCharges.invoicedLotIdsInMonth(organizationId, month, tx);
    if (lotIds.length === 0) return [];
    const lotsMap = await this.lots.findLotsByIds(lotIds, tx);
    const requestLots = [...lotsMap.values()].filter((lot) => lot.purpose === 'REQUEST');
    if (requestLots.length === 0) return [];

    const requestIds = [...new Set(requestLots.flatMap((lot) => (lot.requestId ? [lot.requestId] : [])))];
    const reqFacts =
      requestIds.length > 0
        ? await this.requestFacts.get().factsOf(requestIds)
        : new Map<string, { beneficiaryCount?: number }>();
    const charges = await this.lotCharges.ofLots(
      requestLots.map((lot) => lot.id),
      tx,
    );

    const candidates: LotIdleAlertCandidate[] = [];
    for (const lot of requestLots) {
      const m = lot.requestId ? (reqFacts.get(lot.requestId)?.beneficiaryCount ?? 1) : 1;
      const chargedBeforeOrSameMonth = charges.filter(
        (charge) => charge.licenseLotId === lot.id && charge.month <= month,
      ).length;
      const stats = lotIdleRatioStats([
        {
          licenseCount: lot.licenseCount,
          beneficiaryCount: m,
          chargedPreOrSameMonthCount: chargedBeforeOrSameMonth,
          unitPriceMinor: lot.unitPriceMinor,
        },
      ]);
      if (stats.exceedsThreshold) {
        candidates.push({
          lotId: lot.id,
          responsibleItAdminEmployeeId: lot.responsibleItAdminEmployeeId,
          ratioPercent: stats.ratioPercent,
        });
      }
    }

    return candidates;
  }

  private async settleExcessGrantCommitment(
    tx: DbTx,
    input: ExcessLicenseGrantInput,
    grantYear: number,
    chargeMinor: bigint,
  ): Promise<LockedCommitmentOfRequest | null> {
    const rows = await this.commitments.lockOfRequest(tx, input.grantRequestId);
    const heldRow =
      rows.find((row) => row.year === grantYear && row.state === 'HELD') ??
      rows.find((row) => row.state === 'HELD') ??
      null;
    if (!heldRow) return null;

    const held = heldRow.amountMinor - heldRow.releasedMinor - heldRow.appliedMinor;
    const applied = chargeMinor < held ? chargeMinor : held;
    const remainder = held - applied;

    if (applied > 0n) {
      await this.commitments.applyInvoice(tx, heldRow, {
        takeMinor: applied,
        stateAfter: remainder === 0n ? 'EXPENSED' : 'HELD',
      });
    }
    if (remainder > 0n) {
      await this.commitments.release(
        tx,
        {
          id: heldRow.id,
          year: heldRow.year,
          amountMinor: heldRow.amountMinor,
          releasedMinor: heldRow.releasedMinor,
          appliedMinor: heldRow.appliedMinor + applied,
          state: 'HELD',
        },
        {
          takeMinor: remainder,
          reason: 'GRANTED_FROM_POOL',
          reasonText: input.reference,
          releasedByEmployeeId: null,
          now: input.now,
        },
      );
    }

    return heldRow;
  }
}
