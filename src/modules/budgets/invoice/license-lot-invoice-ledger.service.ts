import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DONG } from '../../../core/money/money';
import { Prisma } from '../../../generated/prisma/client';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { LicenseLotView } from '../../catalog/public/license-lot.types';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { budgetAuditEvent } from '../budget/budget-facts.service';
import { CommitmentRepo, type LockedCommitmentOfRequest } from '../budget/commitment.repo';
import { InvoiceRepo } from '../budget/invoice.repo';
import { PurchaseInvoiceRecordRefusedError } from '../public/budgets.errors';
import type { PurchaseInvoiceRecordInput, PurchaseInvoiceRecorded } from '../public/budgets.types';
import { planLotInvoiceConfirmation } from '../shared-pool-line/license-lot-cost.policy';
import { ThresholdAlertService, type ThresholdWatch } from '../threshold/threshold-alert.service';
import { InvoiceAllocationRepo } from './invoice-allocation.repo';
import { InvoiceYearApplicationRepo } from './invoice-year-application.repo';

export interface InvoiceMeta {
  readonly actualCostMinor: bigint;
  readonly allocationMonth: BusinessDate;
  readonly matchResult: PurchaseInvoiceRecorded['matchResult'];
}

/**
 * Budget-ledger writer for K4 license-lot invoices and post-invoice group withdrawals (`F13c`, `D-16`).
 * Lives in `invoice/` so `shared-pool-line/` never depends on `invoice/`.
 */
@Injectable()
export class LicenseLotInvoiceLedgerService {
  constructor(
    private readonly commitments: CommitmentRepo,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly invoices: InvoiceRepo,
    private readonly allocations: InvoiceAllocationRepo,
    private readonly yearApplications: InvoiceYearApplicationRepo,
    private readonly thresholds: ThresholdAlertService,
    private readonly audit: AuditApi,
  ) {}

  invoiceExists(tx: DbTx, organizationId: string, vendorId: string, number: string): Promise<boolean> {
    return this.invoices.exists(tx, organizationId, vendorId, number);
  }

  async persistPoolOnlyLotInvoice(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
    lot: LicenseLotView,
    meta: InvoiceMeta,
    stampLotActual: () => Promise<void>,
  ): Promise<PurchaseInvoiceRecorded> {
    const plan = planLotInvoiceConfirmation({
      purpose: lot.purpose,
      actualMinor: meta.actualCostMinor,
      licenseCount: lot.licenseCount,
      beneficiaryCount: 0,
      unitPriceMinor: lot.unitPriceMinor,
      preInvoiceChargedCount: 0,
      preInvoiceChargedSumMinor: 0n,
    });
    if (plan.kind !== 'POOL_BUCKET') throw new PurchaseInvoiceRecordRefusedError('NO_PLACE');

    const invoice = await this.insertLotInvoice(
      tx,
      buildLotInvoicePayload(actor, input, lot.id, meta, {
        commitmentId: null,
        costCenterId: null,
        appliedMinor: 0n,
      }),
    );
    await this.allocations.insertMany(tx, [
      {
        invoiceId: invoice.id,
        month: meta.allocationMonth,
        amountMinor: plan.amountMinor,
        taxPartMinor: input.nonDeductibleTaxMinor,
        bucket: plan.bucket,
        kind: 'ORIGINAL',
      },
    ]);
    await stampLotActual();
    await this.auditLotInvoice(tx, actor, input, {
      invoiceId: invoice.id,
      lotId: lot.id,
      allocationMonth: meta.allocationMonth,
      booking: 'SUBSCRIPTION',
      actualCostMinor: meta.actualCostMinor,
      commitmentId: null,
      costCenterId: null,
      appliedMinor: null,
    });

    return {
      invoiceId: invoice.id,
      booking: 'SUBSCRIPTION',
      commitmentId: null,
      costCenterId: null,
      subscriptionId: lot.id,
      actualCostMinor: meta.actualCostMinor,
      appliedMinor: 0n,
      matchResult: meta.matchResult,
    };
  }

  async persistRequestLotInvoice(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
    lot: LicenseLotView,
    meta: InvoiceMeta,
    extra: {
      preInvoiceChargedCount: number;
      preInvoiceChargedSumMinor: bigint;
      stampLotActual: () => Promise<void>;
    },
  ): Promise<PurchaseInvoiceRecorded> {
    const beneficiaryCount = input.lotBeneficiaryCount ?? 1;
    const plan = planLotInvoiceConfirmation({
      purpose: 'REQUEST',
      actualMinor: meta.actualCostMinor,
      licenseCount: lot.licenseCount,
      beneficiaryCount,
      unitPriceMinor: lot.unitPriceMinor,
      preInvoiceChargedCount: extra.preInvoiceChargedCount,
      preInvoiceChargedSumMinor: extra.preInvoiceChargedSumMinor,
    });
    if (plan.kind !== 'REQUEST') throw new PurchaseInvoiceRecordRefusedError('NO_PLACE');

    const allocationYear = Number(meta.allocationMonth.slice(0, 4));
    const { commitment, costCenterId } = await this.resolvePlacement(tx, input, lot, allocationYear);
    const watch = await this.watchThreshold(tx, commitment, costCenterId, allocationYear);
    const appliedMinor = await this.applyCommitment(tx, commitment, plan.costCenterMinor);
    const invoice = await this.insertLotInvoice(
      tx,
      buildLotInvoicePayload(actor, input, lot.id, meta, {
        commitmentId: commitment?.id ?? null,
        costCenterId: commitment ? null : costCenterId,
        appliedMinor,
      }),
    );

    await this.writeRequestAllocations(tx, {
      invoiceId: invoice.id,
      month: meta.allocationMonth,
      year: allocationYear,
      costCenterId,
      commitmentId: commitment?.id ?? null,
      appliedMinor,
      taxVarianceMinor: plan.taxVariancePerLicenseMinor * BigInt(beneficiaryCount),
      plan,
    });
    await extra.stampLotActual();
    if (watch !== null) await this.thresholds.settle(tx, watch, input.now);

    return this.completeRequestInvoice(tx, actor, input, {
      invoiceId: invoice.id,
      lotId: lot.id,
      meta,
      commitmentId: commitment?.id ?? null,
      costCenterId,
      appliedMinor,
    });
  }

  async findActiveCommitment(tx: DbTx, requestId: string, year: number): Promise<LockedCommitmentOfRequest | null> {
    const rows = await this.commitments.lockOfRequest(tx, requestId);

    return (
      rows.find((row) => row.year === year && row.state !== 'RELEASED') ??
      rows.find((row) => row.state !== 'RELEASED') ??
      null
    );
  }

  async releaseHeldWithdrawal(
    tx: DbTx,
    commitment: LockedCommitmentOfRequest,
    unitCostActualMinor: bigint,
    reference: string,
    now: Date,
  ): Promise<void> {
    const held = commitment.amountMinor - commitment.releasedMinor - commitment.appliedMinor;
    const takeMinor = unitCostActualMinor < held ? unitCostActualMinor : held;
    if (takeMinor <= 0n) return;
    await this.commitments.release(tx, commitment, {
      takeMinor,
      reason: 'PARTICIPANT_WITHDRAWN',
      reasonText: reference,
      releasedByEmployeeId: null,
      now,
    });
  }

  async recordWithdrawalAllocations(
    tx: DbTx,
    detail: {
      invoiceId: string;
      commitmentId: string | null;
      withdrawalYear: number;
      unitCostActualMinor: bigint;
      month: BusinessDate;
      costCenterId: string;
      costCenterAdjustmentMinor: bigint;
      poolIdleAdjustmentMinor: bigint;
    },
  ): Promise<void> {
    await this.allocations.insertMany(tx, [
      {
        invoiceId: detail.invoiceId,
        month: detail.month,
        amountMinor: detail.costCenterAdjustmentMinor,
        bucket: 'COST_CENTER',
        costCenterId: detail.costCenterId,
        commitmentId: detail.commitmentId,
        kind: 'WITHDRAWAL',
      },
      {
        invoiceId: detail.invoiceId,
        month: detail.month,
        amountMinor: detail.poolIdleAdjustmentMinor,
        bucket: 'POOL_IDLE',
        kind: 'WITHDRAWAL',
      },
    ]);
    await this.yearApplications.insert(tx, {
      invoiceId: detail.invoiceId,
      year: detail.withdrawalYear,
      costCenterId: detail.costCenterId,
      commitmentId: detail.commitmentId,
      source: 'WITHDRAWAL',
      appliedMinor: -detail.unitCostActualMinor,
      taxVarianceMinor: 0n,
    });
  }

  private async resolvePlacement(
    tx: DbTx,
    input: PurchaseInvoiceRecordInput,
    lot: LicenseLotView,
    allocationYear: number,
  ): Promise<{ commitment: LockedCommitmentOfRequest | null; costCenterId: string }> {
    const rows = lot.requestId ? await this.commitments.lockOfRequest(tx, lot.requestId) : [];
    const commitment =
      rows.find((row) => row.year === allocationYear && row.state !== 'RELEASED') ??
      rows.find((row) => row.state !== 'RELEASED') ??
      null;
    const costCenterId = commitment?.costCenterId ?? input.chargedCostCenterId;
    if (!costCenterId) throw new PurchaseInvoiceRecordRefusedError('NO_PLACE');

    return { commitment, costCenterId };
  }

  private async watchThreshold(
    tx: DbTx,
    commitment: LockedCommitmentOfRequest | null,
    costCenterId: string,
    year: number,
  ): Promise<ThresholdWatch | null> {
    if (commitment === null) {
      const watch = await this.thresholds.watch(tx, [{ costCenterId, year }]);
      await this.yearLock.lock(tx, costCenterId, [year]);

      return watch;
    }

    return commitment.attachedVersionId !== null
      ? this.thresholds.watch(tx, [{ costCenterId: commitment.costCenterId, year: commitment.year }])
      : null;
  }

  private async applyCommitment(
    tx: DbTx,
    commitment: LockedCommitmentOfRequest | null,
    costCenterMinor: bigint,
  ): Promise<bigint> {
    if (!commitment || commitment.state !== 'HELD' || costCenterMinor <= 0n) return 0n;
    const held = commitment.amountMinor - commitment.releasedMinor - commitment.appliedMinor;
    const takeMinor = costCenterMinor < held ? costCenterMinor : held;
    if (takeMinor <= 0n) return 0n;
    const stateAfter = held - takeMinor === 0n ? 'EXPENSED' : 'HELD';
    await this.commitments.applyInvoice(tx, commitment, { takeMinor, stateAfter });

    return takeMinor;
  }

  private async writeRequestAllocations(
    tx: DbTx,
    input: {
      invoiceId: string;
      month: BusinessDate;
      year: number;
      costCenterId: string;
      commitmentId: string | null;
      appliedMinor: bigint;
      taxVarianceMinor: bigint;
      plan: Extract<ReturnType<typeof planLotInvoiceConfirmation>, { kind: 'REQUEST' }>;
    },
  ): Promise<void> {
    const lines = [
      {
        invoiceId: input.invoiceId,
        month: input.month,
        amountMinor: input.plan.costCenterMinor,
        bucket: 'COST_CENTER' as const,
        costCenterId: input.costCenterId,
        commitmentId: input.commitmentId,
        kind: 'ORIGINAL' as const,
      },
      ...(input.plan.poolAllocation
        ? [
            {
              invoiceId: input.invoiceId,
              month: input.month,
              amountMinor: input.plan.poolAllocation.amountMinor,
              bucket: input.plan.poolAllocation.bucket,
              kind: input.plan.poolAllocation.kind,
            },
          ]
        : []),
    ];
    await this.allocations.insertMany(tx, lines);

    if (input.commitmentId !== null || input.appliedMinor !== 0n || input.taxVarianceMinor !== 0n) {
      await this.yearApplications.insert(tx, {
        invoiceId: input.invoiceId,
        year: input.year,
        costCenterId: input.costCenterId,
        commitmentId: input.commitmentId,
        source: 'CONFIRMATION',
        appliedMinor: input.appliedMinor,
        taxVarianceMinor: input.taxVarianceMinor,
      });
    }
  }

  private async completeRequestInvoice(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
    ctx: {
      invoiceId: string;
      lotId: string;
      meta: InvoiceMeta;
      commitmentId: string | null;
      costCenterId: string;
      appliedMinor: bigint;
    },
  ): Promise<PurchaseInvoiceRecorded> {
    const booking: PurchaseInvoiceRecorded['booking'] = ctx.commitmentId ? 'COMMITMENT' : 'COST_CENTER';
    await this.auditLotInvoice(tx, actor, input, {
      invoiceId: ctx.invoiceId,
      lotId: ctx.lotId,
      allocationMonth: ctx.meta.allocationMonth,
      booking,
      actualCostMinor: ctx.meta.actualCostMinor,
      commitmentId: ctx.commitmentId,
      costCenterId: ctx.commitmentId ? null : ctx.costCenterId,
      appliedMinor: ctx.appliedMinor,
    });

    return {
      invoiceId: ctx.invoiceId,
      booking,
      commitmentId: ctx.commitmentId,
      costCenterId: ctx.commitmentId ? null : ctx.costCenterId,
      subscriptionId: ctx.lotId,
      actualCostMinor: ctx.meta.actualCostMinor,
      appliedMinor: ctx.appliedMinor,
      matchResult: ctx.meta.matchResult,
    };
  }

  private async auditLotInvoice(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
    info: {
      invoiceId: string;
      lotId: string;
      allocationMonth: BusinessDate;
      booking: PurchaseInvoiceRecorded['booking'];
      actualCostMinor: bigint;
      commitmentId: string | null;
      costCenterId: string | null;
      appliedMinor: bigint | null;
    },
  ): Promise<void> {
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, input.organizationId, 'INVOICE.RECORDED', 'INVOICE', info.invoiceId, {
        purchaseInvoiceId: input.purchaseInvoiceId,
        licenseLotId: info.lotId,
        serviceMonth: info.allocationMonth,
        booking: info.booking,
        ...(info.appliedMinor !== null
          ? {
              commitmentId: info.commitmentId,
              costCenterId: info.costCenterId,
              appliedMinor: info.appliedMinor.toString(),
            }
          : {}),
        actualCostMinor: info.actualCostMinor.toString(),
      }),
    );
  }

  private async insertLotInvoice(tx: DbTx, input: Parameters<InvoiceRepo['insert']>[1]) {
    try {
      return await this.invoices.insert(tx, input);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PurchaseInvoiceRecordRefusedError('DUPLICATE_NUMBER');
      }
      throw error;
    }
  }
}

function buildLotInvoicePayload(
  actor: AuthenticatedPrincipal,
  input: PurchaseInvoiceRecordInput,
  lotId: string,
  meta: InvoiceMeta,
  place: { commitmentId: string | null; costCenterId: string | null; appliedMinor: bigint },
): Parameters<InvoiceRepo['insert']>[1] {
  return {
    organizationId: input.organizationId,
    commitmentId: place.commitmentId,
    vendorId: input.vendorId,
    number: input.number,
    issuedOn: input.issuedOn,
    currency: DONG,
    netMinor: input.netMinor,
    deductibleTaxMinor: input.deductibleTaxMinor,
    nonDeductibleTaxMinor: input.nonDeductibleTaxMinor,
    actualCostMinor: meta.actualCostMinor,
    appliedMinor: place.appliedMinor,
    matchResult: meta.matchResult,
    note: null,
    recordedByEmployeeId: actor.employeeId,
    now: input.now,
    serviceMonth: meta.allocationMonth,
    purchaseInvoiceId: input.purchaseInvoiceId,
    subscriptionId: lotId,
    costCenterId: place.costCenterId,
    unallocated: null,
    poolFigures: null,
  };
}
