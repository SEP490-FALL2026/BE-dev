import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type {
  NextPeriodInput,
  PeriodAdjustment,
  RenewalPeriodFacts,
} from '../../../catalog/public/subscription-period.types';
import type { BusinessDate } from '../../../../core/business-date';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { RenewalOutcomeService } from '../outcome/renewal-outcome.service';
import type { SeatsNeededCounts } from '../seats-needed/renewal-seats-needed.policy';
import { RenewalSeatsNeededService } from '../seats-needed/renewal-seats-needed.service';
import { RenewalPartiesService } from '../subscription-renewal-parties.service';
import { RenewalError } from '../subscription-renewal.errors';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import type { RenewalChoice, RenewalOutcomeKind, RenewalRecord } from '../subscription-renewal.types';
import { RenewalRecordTrail, type RecordedBy } from './renewal-record-trail.service';
import { countsRefusal, existingCaseOf, noticeBasisOf, preflightOf, type RecordRefusal } from './renewal-record.policy';

export interface RecordRenewalInput {
  subscriptionId: string;
  choice: RenewalChoice;
  /** The seats of the next period; none for a cancellation. It must be the number the system counts (`QĐ-104d`(1)). */
  proposedQuantity?: number;
  /** The evidence of the vendor minimum, when the seats are that minimum above the need. */
  note?: string;
  outcome: RenewalOutcomeKind;
  outcomeNote?: string;
  /** The new period the vendor confirmed, when there is one. */
  nextPeriod?: Omit<NextPeriodInput, 'previousSubscriptionId'>;
  /** What closing a subscription asks the IT Admin to confirm (`QĐ-99i`): only with a cancellation. */
  closure?: { dataExported: boolean; adminsTransferred: boolean };
}

/** What the checks of the request found under the lock of the period: its point and the seats counted. */
interface Checked {
  adjustment: PeriodAdjustment;
  counts: SeatsNeededCounts;
  quantity: number | null;
  note: string | null;
}

const textOf = (value: string | undefined): string | null => value?.trim() || null;

const errorOf = (refusal: RecordRefusal): RenewalError => new RenewalError(refusal.problem, refusal.details);

/**
 * The result of the adjustment of a subscription of the shared pool, recorded by the IT Admin in one write (`QĐ-103e`, `QĐ-104d`, `QĐ-106i`,
 * `SBF-20` §4.4): the choice the system counts for the next period, the decision — the IT Admin in charge decides alone, no head and no
 * spending approver — and what the vendor did, in ONE transaction under the lock of the period, so the case never waits for anybody. Any IT
 * Admin records (`QĐ-58b`): the one who stands in for the IT Admin responsible says so in the audit trail and the one responsible is told.
 * Finance is told of the new period (`QĐ-106i`(3)); a renewal the vendor made that was not chosen is told to everyone it concerns at once
 * (`QĐ-106i`(4)). It creates no budget commitment (`QĐ-62s`) and opens no revocation (`SBF-18` is not called).
 */
@Injectable()
export class RenewalRecordService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly parties: RenewalPartiesService,
    private readonly seatsNeeded: RenewalSeatsNeededService,
    private readonly outcomes: RenewalOutcomeService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly trail: RenewalRecordTrail,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws RenewalError (`NOT_FOUND`, `NOT_RENEWABLE`, `CONTRACT_DATA_INCOMPLETE`, `BEFORE_ADJUSTMENT_POINT`, `QUANTITY_INVALID`,
   * `CANCEL_NOT_ALLOWED`, `QUANTITY_NOT_SEATS_NEEDED`, `VENDOR_MINIMUM_EVIDENCE_REQUIRED`, `ALREADY_PROPOSED` and the refusals of the
   * outcome: `OUTCOME_MISMATCH`, `EXCESS_NOT_REVOKED`, `SEATS_HAVE_OPEN_TASKS`, `PERIOD_REFUSED`); nothing is written then.
   */
  async record(actor: AuthenticatedPrincipal, input: RecordRenewalInput, now = new Date()): Promise<RenewalRecord> {
    return this.runner.run(async (tx) => {
      const period = await this.periods.lockPeriod(tx, input.subscriptionId);
      if (!period) throw new RenewalError('NOT_FOUND');
      const today = await this.organizationReads.businessToday(now, tx);
      const checked = await this.check(tx, period, input, today);
      const who = await this.parties.substituteOf(actor, period, tx);
      const decided = await this.writeCase(tx, actor, period, input, checked, who, { today, now });
      const result = await this.outcomes.recordIn(
        tx,
        actor,
        decided,
        { outcome: input.outcome, note: input.outcomeNote, nextPeriod: input.nextPeriod },
        { today, now },
        {
          endingBy: checked.adjustment.end,
          audit: {
            closure: input.closure ?? null,
            lateRenewal: today > checked.adjustment.end,
            substitute: who.substitute,
            responsibleItAdminEmployeeId: who.responsibleItAdminEmployeeId,
          },
        },
      );
      await this.trail.told(tx, result.recorded, period, checked.adjustment, who, {
        outcome: input.outcome,
        nextQuantity: input.nextPeriod?.purchasedQuantity ?? null,
      });

      return result.recorded;
    });
  }

  /** The refusals of `SBF-20` §4.4 steps 2 to 7, in the order the route answers, under the lock of the period. */
  private async check(
    tx: DbTx,
    period: RenewalPeriodFacts,
    input: RecordRenewalInput,
    today: BusinessDate,
  ): Promise<Checked> {
    const quantity = input.proposedQuantity ?? null;
    const note = textOf(input.note);
    const ready = preflightOf({ period, today, choice: input.choice, quantity });
    if ('refusal' in ready) throw errorOf(ready.refusal);
    const { adjustment } = ready;
    const counts = await this.seatsNeeded.countFor(
      {
        subscriptionId: period.subscriptionId,
        planId: period.planId,
        vendorMinimumSeats: period.vendorMinimumSeats,
        isPrimaryForPlan: period.isPrimaryForPlan,
        renewalOn: adjustment.end,
        today,
      },
      tx,
    );
    const refusal = countsRefusal(counts, { choice: input.choice, quantity, note });
    if (refusal) throw errorOf(refusal);
    const cases = (await this.repo.ofSubscriptions([period.subscriptionId], tx)).get(period.subscriptionId) ?? [];
    const standing = existingCaseOf(cases, adjustment.deadline);
    if (standing) throw new RenewalError('ALREADY_PROPOSED', { renewalId: standing.id });

    return { adjustment, counts, quantity, note };
  }

  /** Writes the case and its decision, the IT Admin in charge deciding alone, and returns what the outcome is recorded against. */
  private async writeCase(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    period: RenewalPeriodFacts,
    input: RecordRenewalInput,
    checked: Checked,
    who: RecordedBy,
    when: { today: BusinessDate; now: Date },
  ): Promise<{ record: RenewalRecord; decision: NonNullable<RenewalRecord['decision']>; period: RenewalPeriodFacts }> {
    const { adjustment, counts, quantity } = checked;
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A renewal was recorded before installation');
    const proposed = await this.repo.insert(tx, {
      organizationId: organization.id,
      subscriptionId: period.subscriptionId,
      noticeBasis: noticeBasisOf(adjustment.kind, period.notice.source),
      noticeBaseDate: adjustment.deadline,
      proposedChoice: input.choice,
      proposedQuantity: quantity,
      proposalNote: checked.note,
      seatsNeeded: counts.seatsNeeded,
      proposedByEmployeeId: actor.employeeId,
      proposedByAppUserId: actor.appUserId,
    });
    // The lock of the period serializes two IT Admins; the unique index of the period is the last word all the same.
    if (!proposed) throw new RenewalError('ALREADY_PROPOSED');
    await this.trail.proposed(tx, actor, proposed, counts, who);
    const record = await this.repo.recordDecision(tx, proposed.id, {
      choice: input.choice,
      quantity,
      reason: null,
      decidedByEmployeeId: actor.employeeId,
      decidedByAppUserId: actor.appUserId,
      deciderRole: 'IT_ADMIN_IN_CHARGE',
      decidedAt: when.now,
      decidedOn: when.today,
      decidedAfterDeadline: when.today > adjustment.deadline,
      executionPoint: 'AS_PLANNED',
      activeSeatsAtDecision: counts.heldPastRenewal,
      snapshot: { source: 'NOT_CONNECTED', takenAt: when.now.toISOString() },
    });
    const decision = record.decision;
    if (!decision) throw new Error('The decision just written is missing');

    return { record, decision, period };
  }
}
