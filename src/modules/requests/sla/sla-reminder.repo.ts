import { Injectable } from '@nestjs/common';
import { toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SlaReminderRole, SlaStepKind, SlaSubjectKind } from './step-sla.policy';

export interface NewReminder {
  organizationId: string;
  requestId: string;
  subjectKind: SlaSubjectKind;
  subjectId: string;
  stepKind: SlaStepKind | null;
  businessDate: BusinessDate;
  sequence: number;
  holderEmployeeId: string | null;
  dueAt: Date;
  ageWorkingDays: number;
  overdueWorkingDays: number;
}

/**
 * The one writer of `step_sla_reminders` and of the people they were sent to. A reminder is made at most once for a subject on a
 * working day and numbered in order; the database refuses a second one for the same day or the same number, so two workers that
 * meet make exactly one. Nothing here is ever changed or removed (the database refuses that too).
 */
@Injectable()
export class SlaReminderRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The number the next reminder of the subject takes: one more than the last. Read under the lock of the subject. */
  async nextSequence(tx: DbTx, subjectKind: SlaSubjectKind, subjectId: string): Promise<number> {
    const { _max } = await tx.stepSlaReminder.aggregate({
      where: { subjectKind, subjectId },
      _max: { sequence: true },
    });

    return (_max.sequence ?? 0) + 1;
  }

  /** Makes the reminder; the id of the one made, or null when the subject already has one for the day or for that number. */
  async insert(tx: DbTx, reminder: NewReminder): Promise<string | null> {
    const made = await tx.stepSlaReminder.createManyAndReturn({
      data: [{ ...reminder, businessDate: toDateColumn(reminder.businessDate) }],
      skipDuplicates: true,
      select: { id: true },
    });

    return made[0]?.id ?? null;
  }

  async insertRecipients(
    tx: DbTx,
    reminderId: string,
    recipients: readonly { employeeId: string; role: SlaReminderRole }[],
  ): Promise<void> {
    if (recipients.length === 0) return;
    await tx.stepSlaReminderRecipient.createMany({
      data: recipients.map((recipient) => ({ reminderId, employeeId: recipient.employeeId, role: recipient.role })),
    });
  }

  /** How many reminders each of these subjects has had, in one read; a subject never reminded is absent. */
  async countsFor(subjectKind: SlaSubjectKind, subjectIds: readonly string[]): Promise<Map<string, number>> {
    if (subjectIds.length === 0) return new Map();
    const rows = await this.prisma.stepSlaReminder.groupBy({
      by: ['subjectId'],
      where: { subjectKind, subjectId: { in: [...subjectIds] } },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.subjectId, row._count._all]));
  }
}
