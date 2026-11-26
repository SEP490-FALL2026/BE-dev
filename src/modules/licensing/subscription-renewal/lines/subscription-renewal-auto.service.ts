import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../../audit/public/audit.api';
import { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import type { SystemActor } from '../../public/licensing.types';
import { noticeRecipients, type EndEventKind } from '../alerts/renewal-adjustment-alerts.policy';
import { RenewalOutcomeService } from '../outcome/renewal-outcome.service';
import { noticeBasisOf } from '../record/renewal-record.policy';
import { RenewalNotifier } from '../subscription-renewal-notifier.service';
import type { RenewalPeople } from '../subscription-renewal-parties.service';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import { SubscriptionRenewalLinesFactsService } from './subscription-renewal-lines-facts.service';
import { deriveChoiceFromTotals, nextPeriodDatesForAutoRenewal } from './subscription-renewal-lines.policy';

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export interface CutoffLockSubject {
  period: RenewalPeriodFacts;
  adjustment: PeriodAdjustment;
  today: BusinessDate;
  now?: Date;
}

export interface AutoPassedRenewalSubject {
  organizationId: string;
  today: BusinessDate;
  period: RenewalPeriodFacts;
  adjustment: PeriodAdjustment;
  kind: EndEventKind;
  people: RenewalPeople;
  now?: Date;
}

/**
 * Handles cutoff target locking (`lockedBy: 'SYSTEM'`) and post-renewal-day automatic resolution:
 * - `autoRenew = true`: records a system `UNCONFIRMED` renewal via `RenewalOutcomeService.recordIn` with `seats(L, renewalOn - 1)`,
 *   carries held seats (`RENEWAL_CARRY`), and creates `AUTO_RENEWAL_INCIDENT`.
 * - `autoRenew = false`: records `EXPIRY_MARKED` and closes live lines `ENDED` on `endDate`.
 * Serializes concurrent instances behind `SubscriptionPeriodApi.lockPeriod` (tier 6) before writing.
 */
@Injectable()
export class SubscriptionRenewalAutoService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly seatLedger: SeatLedgerApi,
    private readonly linesReader: SubscriptionRenewalLinesFactsService,
    private readonly outcomes: RenewalOutcomeService,
    private readonly notifier: RenewalNotifier,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Locks `subscription_line_targets` at cutoff (`today > deadline`) with `lockedBy = 'SYSTEM'` and `recordedQuantity = null`. */
  async lockCutoffIfDue(subject: CutoffLockSubject): Promise<boolean> {
    if (subject.today <= subject.adjustment.deadline) return false;
    const now = subject.now ?? new Date();

    return this.runner.run(async (tx) => {
      const locked = await this.periods.lockPeriod(tx, subject.period.subscriptionId);
      if (!locked || locked.renewedById !== null) return false;
      const cases = (await this.repo.ofSubscriptions([locked.subscriptionId], tx)).get(locked.subscriptionId) ?? [];
      if (cases.some((item) => item.noticeBaseDate === subject.adjustment.deadline)) return false;

      return this.linesReader.lockCutoffTargets(tx, locked, subject.adjustment.end, subject.today, now);
    });
  }

  /** Automatically resolves a period whose renewal day has passed with no case yet; false if already handled concurrently. */
  async handlePassedRenewalDay(subject: AutoPassedRenewalSubject): Promise<boolean> {
    const now = subject.now ?? new Date();

    return this.runner.run(async (tx) => {
      const locked = await this.periods.lockPeriod(tx, subject.period.subscriptionId);
      if (!locked || locked.renewedById !== null) return false;
      if ((await this.repo.deadlineEventsOf([locked.subscriptionId], tx)).has(locked.subscriptionId)) return false;

      const cases = (await this.repo.ofSubscriptions([locked.subscriptionId], tx)).get(locked.subscriptionId) ?? [];
      const hasStandingCase = cases.some(
        (item) => item.noticeBaseDate === subject.adjustment.deadline || item.state === 'DECIDED',
      );
      if (hasStandingCase) return false;

      if (!locked.autoRenew) return this.markExpired(tx, locked, subject);

      return this.autoRenewPeriod(tx, locked, subject, now);
    });
  }

  private async markExpired(tx: DbTx, locked: RenewalPeriodFacts, subject: AutoPassedRenewalSubject): Promise<boolean> {
    const renewalDay = subject.adjustment.end;
    const event = await this.repo.insertDeadlineEvent(tx, {
      organizationId: subject.organizationId,
      subscriptionId: locked.subscriptionId,
      kind: 'EXPIRY_MARKED',
      noticeBaseDate: renewalDay,
      autoRenewAtTime: false,
      recordedOn: subject.today,
    });
    if (!event) return false;

    const closedOn = locked.endDate ?? renewalDay;
    await this.periods.closeExpiredLines(tx, locked.subscriptionId, closedOn);
    await this.audit.record(tx, {
      organizationId: subject.organizationId,
      actorKind: 'SYSTEM',
      action: 'SUBSCRIPTION.EXPIRY_MARKED',
      resourceType: 'Subscription',
      resourceId: locked.subscriptionId,
      before: null,
      after: { baseDate: renewalDay, autoRenew: false, endDate: locked.endDate, reason: 'NO_OUTCOME_BY_RENEWAL_DAY' },
      correlationId: event.id,
    });
    await this.notifier.tell(tx, {
      organizationId: subject.organizationId,
      recipients: noticeRecipients('EXPIRY_MARKED', subject.people),
      code: 'SUBSCRIPTION_EXPIRY_MARKED',
      subject: { type: 'SUBSCRIPTION', id: locked.subscriptionId },
      params: { subscriptionId: locked.subscriptionId, baseDate: renewalDay, endDate: locked.endDate },
      eventKey: `subscription-expiry:${locked.subscriptionId}:${renewalDay}`,
    });

    return true;
  }

  private async autoRenewPeriod(
    tx: DbTx,
    locked: RenewalPeriodFacts,
    subject: AutoPassedRenewalSubject,
    now: Date,
  ): Promise<boolean> {
    const renewalDay = subject.adjustment.end;
    await this.linesReader.lockCutoffTargets(tx, locked, renewalDay, subject.today, now);
    const snapshot = await this.readAutoSnapshot(tx, locked, subject.today, addDays(renewalDay, -1));
    const persisted = await this.persistAutoProposalAndTargets(tx, locked, subject, snapshot, now);
    if (!persisted) return false;

    if (snapshot.totalSeats > 0) {
      const systemActor: SystemActor = { kind: 'SYSTEM', correlationId: `auto-renewal:${persisted.proposedId}` };
      const nextPeriod = this.buildAutoNextPeriod(locked, subject.adjustment, persisted.proposedId, snapshot);
      await this.outcomes.recordIn(
        tx,
        systemActor,
        { record: persisted.decided, decision: persisted.decided.decision!, period: locked },
        { outcome: 'UNCONFIRMED', nextPeriod },
        { today: subject.today, now },
        { endingBy: renewalDay, audit: { autoRecorded: true, lateRenewal: true } },
      );
    }

    await this.recordAutoIncident(tx, locked, subject, renewalDay, persisted.proposedId);
    return true;
  }

  private async readAutoSnapshot(tx: DbTx, locked: RenewalPeriodFacts, today: BusinessDate, refDay: BusinessDate) {
    const computed = await this.linesReader.computeForPeriod(locked, today, tx);
    const serving = await this.linesReader.servingLinesOn(locked.subscriptionId, refDay, tx);
    const emptySeats: ReadonlyMap<string, ReadonlyMap<BusinessDate, number | null>> = new Map();
    const seatsMap: ReadonlyMap<string, ReadonlyMap<BusinessDate, number | null>> = serving.length > 0
      ? await this.seatLedger.seatsOnDays(
          serving.map((line) => line.id),
          refDay,
          refDay,
          tx,
        )
      : emptySeats;

    const targetByLine = new Map(computed.lines.map((line) => [line.subscriptionLineId, line]));
    const fallbackQty = locked.purchasedQuantity ?? 0;
    const lineItems = serving.map((line) => {
      const qty = seatsMap.get(line.id)?.get(refDay) ?? fallbackQty;
      const tgt = targetByLine.get(line.id);
      return {
        subscriptionLineId: line.id,
        seatsNeeded: tgt?.need ?? qty,
        target: tgt?.target ?? qty,
        recordedQuantity: qty,
      };
    });

    const totalSeats =
      lineItems.length > 0 ? lineItems.reduce((sum, item) => sum + item.recordedQuantity, 0) : fallbackQty;
    const totalNeeded = lineItems.length > 0 ? lineItems.reduce((sum, item) => sum + item.seatsNeeded, 0) : totalSeats;
    const totalToday =
      computed.lines.length > 0
        ? computed.lines.reduce((sum, line) => sum + line.seatsToday, 0)
        : locked.purchasedQuantity;

    return { lineItems, totalSeats, totalNeeded, totalToday };
  }

  private async persistAutoProposalAndTargets(
    tx: DbTx,
    locked: RenewalPeriodFacts,
    subject: AutoPassedRenewalSubject,
    snapshot: Awaited<ReturnType<SubscriptionRenewalAutoService['readAutoSnapshot']>>,
    now: Date,
  ) {
    const { choice, quantity } = deriveChoiceFromTotals(snapshot.totalSeats, snapshot.totalToday);
    const proposed = await this.repo.insert(tx, {
      organizationId: subject.organizationId,
      subscriptionId: locked.subscriptionId,
      noticeBasis: noticeBasisOf(subject.adjustment.kind, locked.notice.source),
      noticeBaseDate: subject.adjustment.deadline,
      proposedChoice: choice,
      proposedQuantity: quantity,
      proposalNote: null,
      seatsNeeded: snapshot.totalNeeded,
      proposedByEmployeeId: SYSTEM_ACTOR_ID,
      proposedByAppUserId: SYSTEM_ACTOR_ID,
    });
    if (!proposed) return null;

    const decided = await this.repo.recordDecision(tx, proposed.id, {
      choice,
      quantity,
      reason: null,
      decidedByEmployeeId: SYSTEM_ACTOR_ID,
      decidedByAppUserId: SYSTEM_ACTOR_ID,
      deciderRole: 'SYSTEM',
      decidedAt: now,
      decidedOn: subject.today,
      decidedAfterDeadline: true,
      executionPoint: 'AS_PLANNED',
      activeSeatsAtDecision: snapshot.totalSeats,
      snapshot: { source: 'NOT_CONNECTED', takenAt: now.toISOString() },
    });
    await this.linesReader.persistProposalTargets(tx, {
      renewalOn: subject.adjustment.end,
      renewalId: proposed.id,
      now,
      lockedBy: 'SYSTEM',
      decisions: snapshot.lineItems,
      autoRecorded: true,
      minimumTotalHolderLineId: null,
      minimumTotalNote: null,
    });

    return { proposedId: proposed.id, decided };
  }

  private buildAutoNextPeriod(
    locked: RenewalPeriodFacts,
    adjustment: AutoPassedRenewalSubject['adjustment'],
    renewalId: string,
    snapshot: Awaited<ReturnType<SubscriptionRenewalAutoService['readAutoSnapshot']>>,
  ) {
    const nextDates = nextPeriodDatesForAutoRenewal(locked, adjustment);
    const shared = {
      ...nextDates,
      autoRenew: locked.autoRenew,
      allowsMidTermReduction: locked.allowsMidTermReduction,
      renewalId,
      autoRecorded: true,
    };
    if (snapshot.lineItems.length > 0) {
      return {
        ...shared,
        lines: snapshot.lineItems.map((item) => ({
          subscriptionLineId: item.subscriptionLineId,
          quantity: item.recordedQuantity,
        })),
      };
    }
    return {
      ...shared,
      purchasedQuantity: snapshot.totalSeats,
      unitPrice: { amount: (locked.unitPrice?.amountMinor ?? 0n).toString(), currency: 'VND' },
    };
  }

  private async recordAutoIncident(
    tx: DbTx,
    locked: RenewalPeriodFacts,
    subject: AutoPassedRenewalSubject,
    renewalDay: BusinessDate,
    renewalId: string,
  ): Promise<void> {
    const event = await this.repo.insertDeadlineEvent(tx, {
      organizationId: subject.organizationId,
      subscriptionId: locked.subscriptionId,
      kind: 'AUTO_RENEWAL_INCIDENT',
      noticeBaseDate: renewalDay,
      autoRenewAtTime: true,
      recordedOn: subject.today,
    });
    if (!event) return;

    await this.audit.record(tx, {
      organizationId: subject.organizationId,
      actorKind: 'SYSTEM',
      action: 'SUBSCRIPTION.AUTO_RENEWAL_INCIDENT',
      resourceType: 'Subscription',
      resourceId: locked.subscriptionId,
      before: null,
      after: {
        baseDate: renewalDay,
        autoRenew: true,
        renewalId,
        endDate: locked.endDate,
        reason: 'NO_OUTCOME_BY_RENEWAL_DAY',
      },
      correlationId: event.id,
    });
    await this.notifier.tell(tx, {
      organizationId: subject.organizationId,
      recipients: noticeRecipients('AUTO_RENEWAL_INCIDENT', subject.people),
      code: 'SUBSCRIPTION_AUTO_RENEWAL_INCIDENT',
      subject: { type: 'SUBSCRIPTION', id: locked.subscriptionId },
      params: { subscriptionId: locked.subscriptionId, baseDate: renewalDay, renewalId },
      eventKey: `subscription-incident:${locked.subscriptionId}:${renewalDay}`,
    });
  }
}
