import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { SlaReminderRepo } from './sla-reminder.repo';
import {
  noticeCodeOf,
  noticeParamsOf,
  type Recipient,
  type SlaStanding,
  type SlaStepKind,
  type SlaSubjectKind,
} from './step-sla.policy';

/** What one reminder is about and who it goes to: the facts the notice, the record and the audit event are all made of. */
export interface ReminderToWrite {
  organizationId: string;
  requestId: string;
  subjectKind: SlaSubjectKind;
  /** The id of the step, or of the request for the queue of the head. */
  subjectId: string;
  stepKind: SlaStepKind | null;
  today: BusinessDate;
  holderEmployeeId: string | null;
  standing: SlaStanding;
  recipients: readonly Recipient[];
  correlationId: string;
}

/**
 * Writes one reminder whole, in the transaction the caller holds: the record, the people it was sent to, a notice in the inbox of
 * each of them and the audit event. A second reminder for the same subject on the same day writes nothing and says so, which is
 * what makes two workers that meet make one. If any part fails the transaction rolls all of it back, so there is no reminder that
 * nobody was told of and no notice without its reminder. It touches nothing of the step, the request or a decision.
 */
@Injectable()
export class ReminderWriter {
  constructor(
    private readonly reminders: SlaReminderRepo,
    private readonly notifications: NotificationsApi,
    private readonly audit: AuditApi,
  ) {}

  /** True when the reminder was written now, false when the subject already had one for the day. */
  async write(tx: DbTx, input: ReminderToWrite): Promise<boolean> {
    const sequence = await this.reminders.nextSequence(tx, input.subjectKind, input.subjectId);
    const reminderId = await this.reminders.insert(tx, {
      organizationId: input.organizationId,
      requestId: input.requestId,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      stepKind: input.stepKind,
      businessDate: input.today,
      sequence,
      holderEmployeeId: input.holderEmployeeId,
      dueAt: input.standing.dueAt,
      ageWorkingDays: input.standing.ageWorkingDays,
      overdueWorkingDays: input.standing.overdueWorkingDays,
    });
    if (reminderId === null) return false;

    await this.reminders.insertRecipients(tx, reminderId, input.recipients);
    for (const recipient of input.recipients) {
      const code = noticeCodeOf(input.subjectKind, recipient.role);
      await this.notifications.notifyInApp(tx, {
        organizationId: input.organizationId,
        recipientEmployeeId: recipient.employeeId,
        code,
        subject: { type: 'ACCESS_REQUEST', id: input.requestId },
        params: noticeParamsOf(
          code,
          {
            requestId: input.requestId,
            stepKind: input.stepKind,
            reminderNumber: sequence,
            ageWorkingDays: input.standing.ageWorkingDays,
            overdueWorkingDays: input.standing.overdueWorkingDays,
            holderEmployeeId: input.holderEmployeeId,
          },
          recipient.cause,
        ),
        eventKey: `SLA:${reminderId}`,
      });
    }
    await this.audit.record(tx, {
      organizationId: input.organizationId,
      actorKind: 'SYSTEM',
      actorAppUserId: null,
      actorRoles: [],
      action: 'ACCESS_REQUEST.STEP_REMINDED',
      resourceType: input.subjectKind === 'STEP' ? 'ACCESS_REQUEST_STEP' : 'ACCESS_REQUEST',
      resourceId: input.subjectId,
      before: null,
      after: {
        requestId: input.requestId,
        subjectKind: input.subjectKind,
        stepKind: input.stepKind,
        reminderNumber: sequence,
        businessDate: input.today,
        dueAt: input.standing.dueAt.toISOString(),
        ageWorkingDays: input.standing.ageWorkingDays,
        overdueWorkingDays: input.standing.overdueWorkingDays,
        holderEmployeeId: input.holderEmployeeId,
        notify: input.recipients.map((recipient) => `${recipient.employeeId}:${recipient.role}`).join(','),
      },
      correlationId: input.correlationId,
    });

    return true;
  }
}
