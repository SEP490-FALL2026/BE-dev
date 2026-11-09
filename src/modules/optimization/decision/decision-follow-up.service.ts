import { Injectable } from '@nestjs/common';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { calendarEndOf } from './decision-routing.policy';
import { DecisionReminderService } from './decision-reminder.service';
import { DecisionRoutingService } from './decision-routing.service';
import { DecisionTransferService } from './decision-transfer.service';
import type { FollowUpDay, FollowUpTally } from './decision.types';

/** The parameter that says how many working days a head has to decide (`QĐ-66t`). */
export const DECISION_WORKING_DAYS_PARAMETER = 'GHOST_SEAT_DECISION_WORKING_DAYS';

/**
 * One pass of the follow-up of the queue of the heads (`US-10-06`): a transfer pauses or resumes the recommendations of its holder, the
 * recommendations of the review and action tiers go to the head of the holder's department, a queue whose department lost or gained a
 * head waits or goes back, and what is overdue or about to end is told. The order matters: a holder in a transfer is paused first, so nothing is routed to the department he leaves.
 */
@Injectable()
export class DecisionFollowUpService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
    private readonly transfers: DecisionTransferService,
    private readonly routing: DecisionRoutingService,
    private readonly reminders: DecisionReminderService,
  ) {}

  /** The day a pass works on, or null while the installation has no organization. */
  async dayOf(now: Date): Promise<FollowUpDay | null> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return null;
    const today = await this.organizationReads.businessToday(now);

    return {
      organizationId: organization.id,
      now,
      today,
      workingDays: Number(await this.parameters.getValue(DECISION_WORKING_DAYS_PARAMETER)),
      nonWorking: await this.parameters.getNonWorkingDates(today, calendarEndOf(today)),
    };
  }

  /**
   * Puts the recommendations a run of the rules just made in front of the heads now (pause/resume of people in a transfer first, as the
   * hourly pass does), without the reminders of the pass: a run by hand (`POST /ghost-seat-rule-runs`) must not wait for the next tick
   * to reach the queue (AF-01). Returns how many were routed, or null while the installation has no organization.
   */
  async routeNow(now: Date = new Date()): Promise<number | null> {
    const day = await this.dayOf(now);
    if (!day) return null;
    await this.transfers.pause(day);
    await this.transfers.resume(day);

    return this.routing.routeNew(day);
  }

  /** Runs the pass for `now`; each step reads what the step before left. */
  async run(now: Date = new Date()): Promise<FollowUpTally | null> {
    const day = await this.dayOf(now);
    if (!day) return null;
    const paused = await this.transfers.pause(day);
    const resumed = await this.transfers.resume(day);
    const routed = await this.routing.routeNew(day);
    const headWatched = await this.routing.watchHeads(day);

    const overdueNoticed = await this.reminders.noticeOverdue(day);
    const exemptionsReminded = await this.reminders.remindExemptions(day);

    return { paused, resumed, routed, headWatched, overdueNoticed, exemptionsReminded };
  }
}
