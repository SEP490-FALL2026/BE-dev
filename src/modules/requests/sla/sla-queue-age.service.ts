import { Injectable } from '@nestjs/common';
import { wallClockAt } from '../../../core/working-days';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import { OrganizationService } from '../../organization/organization.service';
import { SlaReminderRepo } from './sla-reminder.repo';
import { standingOf } from './step-sla.policy';

/** How long a request has waited in the queue of its head, as the head reads it on the list. */
export interface QueueAge {
  queuedAt: Date;
  /** Working days lived through since the request entered the queue. */
  waitedWorkingDays: number;
  /** Past the deadline of the queue, the days the head may wait being the ones in force when the request entered it. */
  overdue: boolean;
  /** How many reminders the request has had. */
  reminders: number;
}

/**
 * The age of the requests in the queue of the head (`US-05-09` AC-11, `FR-3.21`), for the list of the head: the days a request
 * may wait are the parameter of the day it entered the queue, counted on the calendar of today. A page is four reads whatever its
 * size (the organization, the days off, the values of the parameter, the reminders). It is read by the spend capability, which
 * shows the age beside what it already shows.
 */
@Injectable()
export class SlaQueueAgeService {
  constructor(
    private readonly organization: OrganizationService,
    private readonly parameters: OperatingParametersService,
    private readonly reminders: SlaReminderRepo,
  ) {}

  /** The age of each request that has entered the queue; a request with no entry time is absent. */
  async ageOf(
    rows: readonly { requestId: string; queuedAt: Date | null }[],
    now: Date = new Date(),
  ): Promise<Map<string, QueueAge>> {
    const queued = rows.filter((row): row is { requestId: string; queuedAt: Date } => row.queuedAt !== null);
    if (queued.length === 0) return new Map();
    const organization = await this.organization.getOrganization();
    if (!organization) return new Map();
    const today = wallClockAt(now, organization.timeZone).date;
    const oldest = wallClockAt(
      queued.reduce((first, row) => (row.queuedAt < first ? row.queuedAt : first), now),
      organization.timeZone,
    ).date;
    const [nonWorkingDates, waits, counts] = await Promise.all([
      this.parameters.getNonWorkingDates(oldest < today ? oldest : today, today),
      this.parameters.getValuesAt(
        'SPEND_SUBMISSION_WAIT_WORKING_DAYS',
        queued.map((row) => row.queuedAt),
      ),
      this.reminders.countsFor(
        'SPEND_QUEUE',
        queued.map((row) => row.requestId),
      ),
    ]);

    return new Map(
      queued.map((row, index) => {
        const standing = standingOf({ createdAt: row.queuedAt, slaWorkingDays: waits[index] as number }, now, {
          nonWorkingDates,
          timeZone: organization.timeZone,
        });

        return [
          row.requestId,
          {
            queuedAt: row.queuedAt,
            waitedWorkingDays: standing.ageWorkingDays,
            overdue: standing.overdue,
            reminders: counts.get(row.requestId) ?? 0,
          },
        ];
      }),
    );
  }
}
