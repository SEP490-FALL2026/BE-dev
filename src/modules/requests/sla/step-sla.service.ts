import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type BusinessDate } from '../../../core/business-date';
import { isWorkingDay, wallClockAt } from '../../../core/working-days';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ReminderWriter } from './reminder-writer.service';
import { SlaRecipientFactsService } from './sla-recipient-facts.service';
import { SlaSubjectRepo, type CandidateCursor } from './sla-subject.repo';
import {
  isReminderDue,
  queueRecipientsOf,
  recipientsOf,
  standingOf,
  type SlaCalendar,
  type SlaStanding,
} from './step-sla.policy';

/** What one pass looked at and what it wrote; a subject that failed is tried again by the next pass. */
export interface SlaSweepResult {
  /** False when the day is not a working day: nothing was looked at. */
  workingDay: boolean;
  stepsReminded: number;
  queueReminded: number;
  failed: number;
}

/** How many candidates a page of a pass reads. */
const PAGE = 200;
const QUEUE_PARAMETER = 'SPEND_SUBMISSION_WAIT_WORKING_DAYS';

/**
 * The reminders of the steps and of the queue of the head, one pass (`US-05-09`, `US-05-06` AC-10, `FR-3.8`, `FR-3.21`). On a
 * working day of the organization it takes the open steps that may be late, oldest first, and for each that is past its deadline
 * and has no reminder today writes one: the record, the people told, a notice in each inbox and the audit event, in one
 * transaction under the lock of the step. It never changes a step, a request or a decision: the holder stays, the step stays
 * open, nobody approves in anybody's place. Two workers at once make one reminder, because a row that is locked is left to the
 * worker that holds it and the database refuses a second reminder for the same day.
 */
@Injectable()
export class StepSlaService {
  private readonly logger = new Logger(StepSlaService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly subjects: SlaSubjectRepo,
    private readonly facts: SlaRecipientFactsService,
    private readonly writer: ReminderWriter,
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  async sweep(now: Date = new Date()): Promise<SlaSweepResult> {
    const result: SlaSweepResult = { workingDay: false, stepsReminded: 0, queueReminded: 0, failed: 0 };
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return result;
    const today = await this.organizationReads.businessToday(now);
    if (!isWorkingDay(today, await this.parameters.getNonWorkingDates(today, today))) return result;
    result.workingDay = true;

    const correlationId = randomUUID();
    const context = { now, today, timeZone: organization.timeZone, correlationId };
    const steps = await this.sweepSteps(context);
    const queue = await this.sweepQueue(context);

    return {
      workingDay: true,
      stepsReminded: steps.reminded,
      queueReminded: queue.reminded,
      failed: steps.failed + queue.failed,
    };
  }

  private async sweepSteps(context: PassContext): Promise<{ reminded: number; failed: number }> {
    let reminded = 0;
    let failed = 0;
    let calendar: SlaCalendar | null = null;
    let after: CandidateCursor | null = null;
    for (;;) {
      const page = await this.subjects.openStepCandidates(context.now, context.today, after, PAGE);
      if (page.length === 0) return { reminded, failed };
      calendar ??= await this.calendarFrom(page[0].createdAt, context);
      for (const candidate of page) {
        const standing = standingOf(candidate, context.now, calendar);
        if (!isReminderDue(standing, context.today, calendar.nonWorkingDates, false)) continue;
        try {
          if (await this.remindStep(candidate.stepId, calendar, context)) reminded += 1;
        } catch (error) {
          failed += 1;
          this.logger.error(
            `The reminder of a step failed (step ${candidate.stepId}): ${describeForOperator(error)}`,
            traceForOperator(error),
          );
        }
      }
      const last = page[page.length - 1];
      after = { at: last.createdAt, id: last.stepId };
    }
  }

  /** One step, one transaction: lock it, look again, and write the reminder when it is still late and not yet reminded today. */
  private async remindStep(stepId: string, calendar: SlaCalendar, context: PassContext): Promise<boolean> {
    return this.runner.run(async (tx) => {
      const step = await this.subjects.lockOpenStep(tx, stepId);
      if (!step) return false;
      const standing = standingOf(step, context.now, calendar);
      if (!isReminderDue(standing, context.today, calendar.nonWorkingDates, false)) return false;

      const people = await this.facts.forStep(tx, {
        holderEmployeeId: step.assigneeEmployeeId,
        today: context.today,
        stepKind: step.kind,
        requesterEmployeeId: step.requesterEmployeeId,
      });

      return this.writer.write(tx, {
        organizationId: step.organizationId,
        requestId: step.requestId,
        subjectKind: 'STEP',
        subjectId: step.stepId,
        stepKind: step.kind,
        today: context.today,
        holderEmployeeId: step.assigneeEmployeeId,
        standing,
        recipients: recipientsOf(people),
        correlationId: context.correlationId,
      });
    });
  }

  private async sweepQueue(context: PassContext): Promise<{ reminded: number; failed: number }> {
    let reminded = 0;
    let failed = 0;
    let calendar: SlaCalendar | null = null;
    let after: CandidateCursor | null = null;
    for (;;) {
      const page = await this.subjects.queueCandidates(context.today, after, PAGE);
      if (page.length === 0) return { reminded, failed };
      calendar ??= await this.calendarFrom(page[0].queuedAt, context);
      // The days a request may wait are the ones in force when it entered the queue, so a change applies only to later requests.
      const waits = await this.parameters.getValuesAt(
        QUEUE_PARAMETER,
        page.map((candidate) => candidate.queuedAt),
      );
      for (const [index, candidate] of page.entries()) {
        const standing = standingOf(
          { createdAt: candidate.queuedAt, slaWorkingDays: waits[index] as number },
          context.now,
          calendar,
        );
        if (!isReminderDue(standing, context.today, calendar.nonWorkingDates, false)) continue;
        try {
          if (await this.remindQueued(candidate.requestId, calendar, context)) reminded += 1;
        } catch (error) {
          failed += 1;
          this.logger.error(
            `The reminder of a request in the queue failed (request ${candidate.requestId}): ${describeForOperator(error)}`,
            traceForOperator(error),
          );
        }
      }
      const last = page[page.length - 1];
      after = { at: last.queuedAt, id: last.requestId };
    }
  }

  private async remindQueued(requestId: string, calendar: SlaCalendar, context: PassContext): Promise<boolean> {
    return this.runner.run(async (tx) => {
      const request = await this.subjects.lockQueuedRequest(tx, requestId);
      if (!request) return false;
      const wait = (await this.parameters.getValuesAt(QUEUE_PARAMETER, [request.queuedAt], tx))[0] as number;
      const standing: SlaStanding = standingOf(
        { createdAt: request.queuedAt, slaWorkingDays: wait },
        context.now,
        calendar,
      );
      if (!isReminderDue(standing, context.today, calendar.nonWorkingDates, false)) return false;

      const people = await this.facts.forQueue(tx, { departmentId: request.departmentId, today: context.today });

      return this.writer.write(tx, {
        organizationId: request.organizationId,
        requestId: request.requestId,
        subjectKind: 'SPEND_QUEUE',
        subjectId: request.requestId,
        stepKind: null,
        today: context.today,
        holderEmployeeId: people.headEmployeeId,
        standing,
        recipients: queueRecipientsOf(people),
        correlationId: context.correlationId,
      });
    });
  }

  /** The calendar from the day the oldest subject began to today: every day that can change its age or its deadline. */
  private async calendarFrom(oldest: Date, context: PassContext): Promise<SlaCalendar> {
    const from = wallClockAt(oldest, context.timeZone).date;

    return {
      nonWorkingDates: await this.parameters.getNonWorkingDates(
        from < context.today ? from : context.today,
        context.today,
      ),
      timeZone: context.timeZone,
    };
  }
}

interface PassContext {
  now: Date;
  today: BusinessDate;
  timeZone: string;
  correlationId: string;
}
