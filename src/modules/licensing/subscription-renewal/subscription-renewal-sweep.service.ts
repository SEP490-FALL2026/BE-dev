import { Injectable, Logger } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../catalog/public/subscription-period.types';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SeatPurchaseInvoiceDueService } from '../shared-pool/seat-purchase-invoice-due.service';
import {
  candidateNotices,
  dataQualityProblemsOf,
  dueNotices,
  type DueNoticeKind,
} from './alerts/renewal-adjustment-alerts.policy';
import { RenewalAlertsService, type AlertKind } from './alerts/renewal-alerts.service';
import { RenewalDeadlineService } from './deadline/renewal-deadline.service';
import { existingCaseOf } from './record/renewal-record.policy';
import { RenewalSeatsNeededService } from './seats-needed/renewal-seats-needed.service';
import { RenewalPartiesService, type RenewalPeople } from './subscription-renewal-parties.service';
import { SubscriptionRenewalRepo } from './subscription-renewal.repo';
import type { DeadlineEventRecord, RenewalRecord } from './subscription-renewal.types';

/** What one pass reads once and every period shares. */
interface PassWorld {
  organizationId: string;
  today: BusinessDate;
  cases: Map<string, RenewalRecord[]>;
  /** The subscriptions the company recorded as cancelled: no alert, warning or event is made for them (`A1C-02`). */
  ending: ReadonlySet<string>;
  events: Map<string, DeadlineEventRecord>;
  shared: Awaited<ReturnType<RenewalPartiesService['sharedPeople']>> | undefined;
}

export interface SweepResult {
  told: number;
  deadlineEvents: number;
  /** The subscriptions whose period failed and were left for the next pass; the others were swept. */
  failed: number;
}

const isAlert = (kind: DueNoticeKind): kind is AlertKind =>
  kind === 'ADJUSTMENT_POINT' || kind === 'RED_ALERT' || kind === 'KEPT';

/**
 * One pass over the subscriptions that have a point of adjustment (`SBF-20` §4.5, `US-11-01`, `US-11-04`): the IT Admin told the point came,
 * the red alert of a plan by the year, the seats a plan by the month keeps, the incident or the end of a period whose renewal day passed with
 * no outcome recorded, and the warning of contract data that gives no point. Every step is idempotent (a person told once, one event per
 * period), so the pass may run again, on several instances, or after a failure. A subscription the company recorded as cancelled is passed
 * over whole (`A1C-02`).
 *
 * A subscription whose period fails (a hook, a write) is logged by its id and the kind of the failure and counted in `failed`; the ones after it are
 * still swept, and the next pass tries it again (as `SeatMonthSweeper` does, `O-2`).
 *
 * Known risk (R2-12): the catalog gives at most 500 subscriptions with no order, so past 500 pool subscriptions the later ones are never
 * seen; the shared pool holds few. The seats a period needs are counted only for a period with something due today.
 */
@Injectable()
export class SubscriptionRenewalSweepService {
  private readonly logger = new Logger(SubscriptionRenewalSweepService.name);

  constructor(
    private readonly periods: SubscriptionPeriodApi,
    private readonly repo: SubscriptionRenewalRepo,
    private readonly parties: RenewalPartiesService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly seatsNeeded: RenewalSeatsNeededService,
    private readonly alerts: RenewalAlertsService,
    private readonly deadlines: RenewalDeadlineService,
    private readonly purchaseDue: SeatPurchaseInvoiceDueService,
  ) {}

  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const result: SweepResult = { told: 0, deadlineEvents: 0, failed: 0 };
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return result;
    try {
      result.told += await this.alerts.sweepWorkspaceAdmins(organization.id);
    } catch (error) {
      result.failed += 1;
      this.logger.error(`Workspace admin alert sweep failed: ${describeForOperator(error)}`);
    }
    const today = await this.organizationReads.businessToday(now);
    try {
      const overdue = await this.purchaseDue.remindOverdue(organization.id, today);
      result.told += overdue.told;
      result.failed += overdue.failed;
    } catch (error) {
      result.failed += 1;
      this.logger.error(`Seat purchase invoice due sweep failed: ${describeForOperator(error)}`);
    }
    const subjects = await this.periods.listAdjustmentSubjects();
    if (subjects.length === 0) return result;
    const ids = subjects.map((period) => period.subscriptionId);
    const world: PassWorld = {
      organizationId: organization.id,
      today,
      cases: await this.repo.ofSubscriptions(ids),
      ending: await this.repo.endingAmong(ids),
      events: await this.repo.deadlineEventsOf(ids),
      shared: undefined,
    };
    for (const period of subjects) {
      try {
        const done = await this.sweepPeriod(period, world);
        result.told += done.told;
        result.deadlineEvents += done.deadlineEvents;
      } catch (error) {
        // Only the id and the kind of the failure are logged, never what the failing step held.
        result.failed += 1;
        this.logger.error(
          `Renewal sweep of subscription ${period.subscriptionId} failed: ${describeForOperator(error)}`,
        );
      }
    }

    return result;
  }

  /** What the pass does for one period: the warnings of its data, then, when something is due today, its alerts and its event. */
  private async sweepPeriod(period: RenewalPeriodFacts, world: PassWorld): Promise<SweepResult> {
    const done: SweepResult = { told: 0, deadlineEvents: 0, failed: 0 };
    if (world.ending.has(period.subscriptionId)) return done;
    const { adjustment } = period;
    const problems = dataQualityProblemsOf(adjustment);
    const eventRecorded = world.events.has(period.subscriptionId);
    const hasCase =
      adjustment !== null && existingCaseOf(world.cases.get(period.subscriptionId) ?? [], adjustment.deadline) !== null;
    const candidates =
      adjustment === null ? [] : candidateNotices(adjustment, world.today, hasCase, period.autoRenew, eventRecorded);
    if (problems.length === 0 && candidates.length === 0) return done;

    // Finance, the spending approver and the Super Admin are read once, and only when a period has something to tell.
    world.shared ??= await this.parties.sharedPeople();
    const people = await this.parties.peopleOf(period, world.shared);
    done.told += await this.sendDataQualityWarnings(problems, world, period, people.itAdmin);
    if (adjustment === null || candidates.length === 0) return done;

    return this.sweepNotices(period, adjustment, world, people, { hasCase, eventRecorded, toldSoFar: done.told });
  }

  private async sendDataQualityWarnings(
    problems: ReturnType<typeof dataQualityProblemsOf>,
    world: PassWorld,
    period: RenewalPeriodFacts,
    itAdmin: Awaited<ReturnType<RenewalPartiesService['peopleOf']>>['itAdmin'],
  ): Promise<number> {
    let told = 0;
    for (const problem of problems) {
      told += await this.alerts.dataQualityWarning({ organizationId: world.organizationId, period, itAdmin, problem });
    }
    return told;
  }

  private async sweepNotices(
    period: RenewalPeriodFacts,
    adjustment: NonNullable<RenewalPeriodFacts['adjustment']>,
    world: PassWorld,
    people: Awaited<ReturnType<RenewalPartiesService['peopleOf']>>,
    state: { hasCase: boolean; eventRecorded: boolean; toldSoFar: number },
  ): Promise<SweepResult> {
    // The seats are counted only now, for a period with something due (R2-12).
    if (!state.hasCase && !state.eventRecorded && world.today > adjustment.deadline) {
      await this.lockPastDeadline(period, adjustment, world.today);
    }
    const counts = await this.seatsNeeded.countFor({
      subscriptionId: period.subscriptionId,
      planId: period.planId,
      vendorMinimumSeats: period.vendorMinimumSeats,
      ...(period.minimumSeatsTotal !== undefined ? { minimumSeatsTotal: period.minimumSeatsTotal } : {}),
      isPrimaryForPlan: period.isPrimaryForPlan,
      renewalOn: adjustment.end,
      today: world.today,
    });
    const due = dueNotices(
      adjustment,
      world.today,
      state.hasCase,
      counts.activeSeatsToday > 0,
      period.purchasedQuantity,
      counts.target,
      period.autoRenew,
      state.eventRecorded,
    );
    const written = await this.write(due, { world, period, adjustment, people, seatsNeeded: counts.seatsNeeded });
    return { told: state.toldSoFar + written.told, deadlineEvents: written.deadlineEvents, failed: 0 };
  }

  private lockPastDeadline(
    period: RenewalPeriodFacts,
    adjustment: PeriodAdjustment,
    today: BusinessDate,
  ): Promise<boolean> {
    return this.deadlines.lockCutoffIfDue
      ? this.deadlines.lockCutoffIfDue({ period, adjustment, today })
      : Promise.resolve(false);
  }

  /** Writes the notices due: the alerts, and the event of the renewal day passed. */
  private async write(
    due: readonly DueNoticeKind[],
    at: {
      world: PassWorld;
      period: RenewalPeriodFacts;
      adjustment: PeriodAdjustment;
      people: RenewalPeople;
      seatsNeeded: number;
    },
  ): Promise<SweepResult> {
    const { world, period, adjustment, people } = at;
    const done: SweepResult = { told: 0, deadlineEvents: 0, failed: 0 };
    const kinds = due.filter(isAlert);
    if (kinds.length > 0) {
      done.told = await this.alerts.sendDue({
        organizationId: world.organizationId,
        period,
        adjustment,
        seatsNeeded: at.seatsNeeded,
        people,
        kinds,
      });
    }
    const ended = due.find((kind) => kind === 'AUTO_RENEWAL_INCIDENT' || kind === 'EXPIRY_MARKED');
    if (ended === 'AUTO_RENEWAL_INCIDENT' || ended === 'EXPIRY_MARKED') {
      const recorded = await this.deadlines.recordPassedRenewalDay({
        organizationId: world.organizationId,
        today: world.today,
        period,
        adjustment,
        kind: ended,
        people,
      });
      if (recorded) done.deadlineEvents = 1;
    }

    return done;
  }
}
