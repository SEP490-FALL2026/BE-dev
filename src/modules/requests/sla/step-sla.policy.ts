import type { BusinessDate } from '../../../core/business-date';
import {
  isWorkingDay,
  slaDueAt,
  wallClockAt,
  workingDaysBetween,
  type NonWorkingDates,
} from '../../../core/working-days';

/**
 * What the reminders of a late step decide, as pure functions of the facts handed in: when a step is due, how old and how late it
 * is, whether it is reminded today, and who is told (`US-05-09`, `US-05-06` AC-10, `US-05-10`, `FR-3.8`). Nothing here reads the
 * database or the clock, and nothing here decides a step: a reminder never moves the holder, never approves and never rejects.
 */

/** The kinds of step that have a deadline: a closed list, so a new kind of step is an addition made here on purpose. */
export const SLA_STEP_KINDS = ['NEED', 'IT_ASSESSMENT', 'FINANCE_REVIEW', 'SPEND_APPROVAL'] as const;
export type SlaStepKind = (typeof SLA_STEP_KINDS)[number];

export type SlaSubjectKind = 'STEP' | 'SPEND_QUEUE';
export type SlaReminderRole = 'HOLDER' | 'SUPERIOR' | 'FINANCE_QUESTION' | 'SUPER_ADMIN';

/** Why the Super Admin is told instead of, or besides, the people who hold the subject. */
export type ReminderCause = 'NO_SUPERIOR' | 'NO_HOLDER' | 'HOLDER_NOT_USABLE';

/** The calendar a deadline is counted on: the days nobody works and the time zone of the organization. */
export interface SlaCalendar {
  nonWorkingDates: NonWorkingDates;
  timeZone: string;
}

/** Where something that began at a moment and may wait `slaWorkingDays` stands at `now`. */
export interface SlaStanding {
  dueAt: Date;
  /** Working days lived through since the day it began, up to and including today. */
  ageWorkingDays: number;
  /** Working days since the day of the deadline, up to and including today; zero on the day it falls due. */
  overdueWorkingDays: number;
  overdue: boolean;
}

/**
 * The deadline is the same time of day, in the time zone of the organization, on the working day `slaWorkingDays` working days
 * after the day it began; the number of days is the one the step carries, not today's parameter. It is overdue when the instant
 * is past the deadline. The clock runs from the creation of the step, so a step given to somebody else, or one that waited for
 * somebody to hold it, keeps its age (`US-05-11` AC-3, `US-05-10` AC-5).
 */
export function standingOf(
  began: { createdAt: Date; slaWorkingDays: number },
  now: Date,
  calendar: SlaCalendar,
): SlaStanding {
  const dueAt = slaDueAt(began.createdAt, began.slaWorkingDays, calendar.nonWorkingDates, calendar.timeZone);
  const today = wallClockAt(now, calendar.timeZone).date;
  const createdOn = wallClockAt(began.createdAt, calendar.timeZone).date;
  const dueOn = wallClockAt(dueAt, calendar.timeZone).date;

  return {
    dueAt,
    ageWorkingDays: workingDaysBetween(createdOn, today, calendar.nonWorkingDates),
    overdueWorkingDays: workingDaysBetween(dueOn, today, calendar.nonWorkingDates),
    overdue: now.getTime() > dueAt.getTime(),
  };
}

/** A reminder is made when the subject is overdue, today is a working day, and none was made for it today (once a working day). */
export function isReminderDue(
  standing: SlaStanding,
  today: BusinessDate,
  nonWorkingDates: NonWorkingDates,
  remindedToday: boolean,
): boolean {
  return standing.overdue && isWorkingDay(today, nonWorkingDates) && !remindedToday;
}

/** Where the holder of a step stands in the organization today, as the rule of the superior reads it. */
export interface HolderPosition {
  holderEmployeeId: string;
  isSpendingApprover: boolean;
  /** Who heads the department the holder is placed in today; null when nobody does. */
  departmentHeadEmployeeId: string | null;
  spendingApproverEmployeeId: string | null;
}

/**
 * The person above the holder (`FR-3.8`, `QĐ-52c`): an employee answers to the head of their department, a head to the spending
 * approver, and the spending approver to nobody. The rule is applied to every holder, an IT Admin, Finance and the fallback
 * approver included. Whether the person named still works is for the caller to judge; the answer is never the holder.
 */
export function superiorOf(position: HolderPosition): string | null {
  if (position.isSpendingApprover) return null;
  const head = position.departmentHeadEmployeeId;
  const named = head === position.holderEmployeeId ? position.spendingApproverEmployeeId : head;

  return named === position.holderEmployeeId ? null : named;
}

/** Who may be told about a late step, as found today; every person here is somebody who still works, or null. */
export interface StepRecipientFacts {
  holderEmployeeId: string | null;
  holderUsable: boolean;
  superiorEmployeeId: string | null;
  superAdminEmployeeId: string | null;
  /** The Finance employee to remind of a question still open on the step; null when there is none or Finance cannot act. */
  financeQuestionEmployeeId: string | null;
}

export interface Recipient {
  employeeId: string;
  role: SlaReminderRole;
  cause: ReminderCause | null;
}

/** Keeps the first part a person plays: nobody is told twice of the same reminder. */
function withoutRepeats(candidates: readonly Recipient[]): Recipient[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    if (seen.has(candidate.employeeId)) return false;
    seen.add(candidate.employeeId);

    return true;
  });
}

/**
 * Who is told that a step is late: the holder when they still work, and their superior; the Super Admin when there is no
 * superior, when nobody holds the step (it waits under control, and the reminder goes on every working day until the
 * configuration is put right) or when the holder has left and the step was not given to anybody yet; Finance besides, when a
 * question to Finance is open. A person who is missing is simply not in the list, so a missing Super Admin leaves a reminder
 * that is recorded and told to nobody.
 */
export function recipientsOf(facts: StepRecipientFacts): Recipient[] {
  const found: Recipient[] = [];
  const superAdmin = facts.superAdminEmployeeId;
  const tellSuperAdmin = (cause: ReminderCause): void => {
    if (superAdmin !== null) found.push({ employeeId: superAdmin, role: 'SUPER_ADMIN', cause });
  };

  if (facts.holderEmployeeId === null) {
    tellSuperAdmin('NO_HOLDER');
  } else if (!facts.holderUsable) {
    tellSuperAdmin('HOLDER_NOT_USABLE');
  } else {
    found.push({ employeeId: facts.holderEmployeeId, role: 'HOLDER', cause: null });
    if (facts.superiorEmployeeId !== null && facts.superiorEmployeeId !== facts.holderEmployeeId) {
      found.push({ employeeId: facts.superiorEmployeeId, role: 'SUPERIOR', cause: null });
    } else {
      tellSuperAdmin('NO_SUPERIOR');
    }
  }
  if (facts.financeQuestionEmployeeId !== null) {
    found.push({ employeeId: facts.financeQuestionEmployeeId, role: 'FINANCE_QUESTION', cause: null });
  }

  return withoutRepeats(found);
}

/** Who may be told that a request waits too long in the queue of its head (`FR-3.21`): the head only, or the Super Admin. */
export interface QueueRecipientFacts {
  headEmployeeId: string | null;
  headUsable: boolean;
  superAdminEmployeeId: string | null;
}

/** The head of the department, and nobody above them; no head, or one who has left, makes it the Super Admin's to see. */
export function queueRecipientsOf(facts: QueueRecipientFacts): Recipient[] {
  if (facts.headEmployeeId !== null && facts.headUsable) {
    return [{ employeeId: facts.headEmployeeId, role: 'HOLDER', cause: null }];
  }

  return facts.superAdminEmployeeId === null
    ? []
    : [{ employeeId: facts.superAdminEmployeeId, role: 'SUPER_ADMIN', cause: 'NO_HOLDER' }];
}

/** The code of the notice a part of a reminder gives. */
export type ReminderNoticeCode =
  | 'STEP_SLA_REMINDER'
  | 'STEP_SLA_ESCALATION'
  | 'STEP_SLA_NO_SUPERIOR'
  | 'SPEND_QUEUE_REMINDER'
  | 'FINANCE_QUESTION_REMINDER';

export function noticeCodeOf(subject: SlaSubjectKind, role: SlaReminderRole): ReminderNoticeCode {
  if (role === 'FINANCE_QUESTION') return 'FINANCE_QUESTION_REMINDER';
  if (subject === 'SPEND_QUEUE') return 'SPEND_QUEUE_REMINDER';
  if (role === 'HOLDER') return 'STEP_SLA_REMINDER';

  return role === 'SUPERIOR' ? 'STEP_SLA_ESCALATION' : 'STEP_SLA_NO_SUPERIOR';
}

/** What a notice of a reminder says: ids, the kind of step, the numbers and the cause; never an amount, a figure or a reason. */
export interface ReminderNoticeFacts {
  requestId: string;
  stepKind: SlaStepKind | null;
  reminderNumber: number;
  ageWorkingDays: number;
  overdueWorkingDays: number;
  holderEmployeeId: string | null;
  questionId: string | null;
}

/** The parameters of the notice of `code`, exactly the keys the closed table of the inbox allows for it. */
export function noticeParamsOf(
  code: ReminderNoticeCode,
  facts: ReminderNoticeFacts,
  cause: ReminderCause | null,
): Record<string, string | number | null> {
  const numbers = {
    reminderNumber: facts.reminderNumber,
    ageWorkingDays: facts.ageWorkingDays,
    overdueWorkingDays: facts.overdueWorkingDays,
  };
  switch (code) {
    case 'STEP_SLA_REMINDER':
      return { requestId: facts.requestId, stepKind: facts.stepKind, ...numbers };
    case 'STEP_SLA_ESCALATION':
      return {
        requestId: facts.requestId,
        stepKind: facts.stepKind,
        ...numbers,
        holderEmployeeId: facts.holderEmployeeId,
      };
    case 'STEP_SLA_NO_SUPERIOR':
      return {
        requestId: facts.requestId,
        stepKind: facts.stepKind,
        ...numbers,
        holderEmployeeId: facts.holderEmployeeId,
        cause,
      };
    case 'SPEND_QUEUE_REMINDER':
      return { requestId: facts.requestId, ...numbers, cause };
    case 'FINANCE_QUESTION_REMINDER':
      return { requestId: facts.requestId, stepKind: facts.stepKind, questionId: facts.questionId, ...numbers };
  }
}

/** A holder with more `PENDING` steps than the threshold is a backlog (`US-05-10` AC-1); equal to it is not. */
export function isBacklog(openSteps: number, threshold: number): boolean {
  return openSteps > threshold;
}
