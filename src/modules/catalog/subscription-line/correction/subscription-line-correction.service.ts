import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../../notifications/public/notifications.api';
import { catalogAuditEvent } from '../../catalog-audit-event.mapper';
import { SeatLedgerService } from '../ledger/seat-ledger.service';
import type { SeatChangeRecord } from '../ledger/seat-ledger.types';
import { SubscriptionLineNotFoundError } from '../subscription-line.errors';
import { SubscriptionLineRepo } from '../subscription-line.repo';
import {
  assertLineCorrectable,
  assertMidTermReductionAllowed,
  assertRefundReductionWithinPurchase,
  judgeVendorCorrection,
  vendorCorrectionRecipients,
} from './subscription-line-correction.policy';

export interface RecordCorrectionInput {
  delta: number;
  effectiveOn: BusinessDate;
  note: string;
  basis?: { requestId: string; beneficiaryEmployeeId: string };
  expectedUpdatedAt: Date;
}

export interface RecordReductionInput {
  refundedSeatChangeId: string;
  quantity: number;
  effectiveOn: BusinessDate;
  note: string;
  expectedUpdatedAt: Date;
}

export interface SeatCorrectionResult {
  id: string;
  subscriptionLineId: string;
  effectiveOn: BusinessDate;
  delta: number;
  reason: SeatChangeRecord['reason'];
  source: SeatChangeRecord['source'];
  basis: SeatChangeRecord['basis'];
  requestId: string | null;
  beneficiaryEmployeeId: string | null;
  refundedSeatChangeId: string | null;
  note: string | null;
  outOfProcess: boolean;
  recordedByEmployeeId: string | null;
  recordedAt: string;
}

function toWire(change: SeatChangeRecord): SeatCorrectionResult {
  return {
    id: change.id,
    subscriptionLineId: change.subscriptionLineId,
    effectiveOn: change.effectiveOn,
    delta: change.delta,
    reason: change.reason,
    source: change.source,
    basis: change.basis,
    requestId: change.requestId,
    beneficiaryEmployeeId: change.beneficiaryEmployeeId,
    refundedSeatChangeId: change.refundedSeatChangeId,
    note: change.note,
    outOfProcess: change.outOfProcess,
    recordedByEmployeeId: change.recordedByEmployeeId,
    recordedAt: change.recordedAt.toISOString(),
  };
}

/**
 * Handles vendor-side seat corrections (`POST /subscription-lines/:id/seat-corrections`) and mid-term seat reductions
 * (`POST /subscription-lines/:id/seat-reductions`) (`W3-19`).
 * Lock order: period `FOR UPDATE` (tier 6) -> line `FOR UPDATE` (tier 6c) -> `seat_changes` insert (tier 6d).
 */
@Injectable()
export class SubscriptionLineCorrectionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly lines: SubscriptionLineRepo,
    private readonly seatLedger: SeatLedgerService,
    private readonly identity: IdentityAccessApi,
    private readonly notifications: NotificationsApi,
    private readonly audit: AuditApi,
  ) {}

  async recordCorrection(
    actor: AuthenticatedPrincipal,
    lineId: string,
    input: RecordCorrectionInput,
  ): Promise<SeatCorrectionResult> {
    const today = await this.seatLedger.businessToday();

    return this.runner.run(async (tx) => {
      const { context, lockedLine } = await this.lockAndAssertCorrectable(tx, actor, lineId, input.expectedUpdatedAt);
      const judgement = judgeVendorCorrection({
        delta: input.delta,
        seatCounting: context.period.seatCounting === 'MEMBERS' ? 'MEMBERS' : 'FIXED',
        hasBasis: input.basis !== undefined,
      });

      const { change } = await this.seatLedger.recordVendor(tx, lockedLine, {
        delta: input.delta,
        effectiveOn: input.effectiveOn,
        note: input.note,
        actor,
        requestId: input.basis?.requestId ?? null,
        beneficiaryEmployeeId: input.basis?.beneficiaryEmployeeId ?? null,
        outOfProcess: judgement.outOfProcess,
        alreadyLocked: true,
        today,
      });

      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          lockedLine.organizationId,
          'SEAT_LEDGER.VENDOR_RECORDED',
          'SeatChange',
          change.id,
          null,
          {
            subscriptionLineId: lockedLine.id,
            delta: change.delta,
            reason: change.reason,
            effectiveOn: change.effectiveOn,
            outOfProcess: change.outOfProcess,
          },
        ),
      );
      await this.notifyCorrection(tx, actor, {
        organizationId: lockedLine.organizationId,
        subscriptionId: context.period.id,
        responsibleItAdminEmployeeId: context.period.responsibleItAdminEmployeeId,
        change,
        notifyR1: judgement.notifyR1,
        notifyFinance: judgement.notifyFinance,
      });

      return toWire(change);
    });
  }

  async recordReduction(
    actor: AuthenticatedPrincipal,
    lineId: string,
    input: RecordReductionInput,
  ): Promise<SeatCorrectionResult> {
    const today = await this.seatLedger.businessToday();

    return this.runner.run(async (tx) => {
      const { context, lockedLine } = await this.lockAndAssertCorrectable(tx, actor, lineId, input.expectedUpdatedAt);
      assertMidTermReductionAllowed({ allowsMidTermReduction: context.period.allowsMidTermReduction });

      const refundedChange = await this.seatLedger.findChange(input.refundedSeatChangeId, tx);
      const alreadyReduced = await this.seatLedger.sumRefundedFor(input.refundedSeatChangeId, tx);
      assertRefundReductionWithinPurchase({
        lineId,
        refundedChange,
        alreadyReduced,
        requestedQuantity: input.quantity,
      });

      const { change } = await this.seatLedger.recordVendor(tx, lockedLine, {
        delta: -input.quantity,
        effectiveOn: input.effectiveOn,
        note: input.note,
        actor,
        refundedSeatChangeId: input.refundedSeatChangeId,
        outOfProcess: false,
        alreadyLocked: true,
        today,
      });

      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          lockedLine.organizationId,
          'SEAT_LEDGER.REDUCTION_RECORDED',
          'SeatChange',
          change.id,
          null,
          {
            subscriptionLineId: lockedLine.id,
            refundedSeatChangeId: input.refundedSeatChangeId,
            delta: change.delta,
            effectiveOn: change.effectiveOn,
          },
        ),
      );

      return toWire(change);
    });
  }

  private async lockAndAssertCorrectable(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    lineId: string,
    expectedUpdatedAt: Date,
  ) {
    const context = await this.lines.findWithPurchaseContext(lineId, tx);
    if (!context) throw new SubscriptionLineNotFoundError();
    const lockedLine = await this.seatLedger.lockPeriodAndLine(tx, context.period.id, lineId);
    if (!lockedLine) throw new SubscriptionLineNotFoundError();

    assertLineCorrectable({
      responsibleItAdminEmployeeId: context.period.responsibleItAdminEmployeeId,
      actorEmployeeId: actor.employeeId,
      closedReason: lockedLine.closedReason,
      ledgerOpenedOn: lockedLine.ledgerOpenedOn,
      periodStatus: context.period.status,
      lineUpdatedAt: lockedLine.updatedAt,
      expectedUpdatedAt,
    });

    return { context, lockedLine };
  }

  private async notifyCorrection(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      subscriptionId: string;
      responsibleItAdminEmployeeId: string | null;
      change: SeatChangeRecord;
      notifyR1: boolean;
      notifyFinance: boolean;
    },
  ): Promise<void> {
    if (!input.notifyR1 && !input.notifyFinance) return;
    const responsible = input.responsibleItAdminEmployeeId;
    const responsibleUsable =
      input.notifyR1 &&
      responsible !== null &&
      (await this.identity.findUsableItAdminEmployeeIds([responsible], tx)).has(responsible);
    const superAdmin =
      input.notifyR1 && !responsibleUsable ? await this.identity.findUsableSuperAdminEmployeeId(tx) : null;
    const finance = input.notifyFinance ? await this.identity.findUsableFinanceEmployeeId(tx) : null;

    const recipients = vendorCorrectionRecipients({
      notifyFinance: input.notifyFinance,
      notifyR1: input.notifyR1,
      responsible,
      responsibleUsable,
      superAdmin,
      finance,
      actor: actor.employeeId,
    });

    for (const recipientEmployeeId of recipients) {
      await this.notifications.notifyInApp(tx, {
        organizationId: input.organizationId,
        recipientEmployeeId,
        code: 'SEAT_LEDGER_VENDOR_RECORDED',
        subject: { type: 'SUBSCRIPTION', id: input.subscriptionId },
        params: {
          subscriptionId: input.subscriptionId,
          subscriptionLineId: input.change.subscriptionLineId,
          seatChangeId: input.change.id,
          delta: input.change.delta,
          effectiveOn: input.change.effectiveOn,
          recordedByEmployeeId: actor.employeeId,
          outOfProcess: input.change.outOfProcess,
        },
        eventKey: `SEAT_LEDGER_VENDOR_RECORDED:${input.change.id}`,
      });
    }
  }
}
