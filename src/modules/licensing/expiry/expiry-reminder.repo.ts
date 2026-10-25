import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ReminderAudience } from './expiry.policy';

/** A right that ends within the reminder range and has not been told to everybody it is owed to yet. */
export interface ReminderCandidate {
  assignmentId: string;
  organizationId: string;
  employeeId: string;
  planId: string;
  expectedEndDate: BusinessDate;
}

interface RawCandidate {
  assignment_id: string;
  organization_id: string;
  employee_id: string;
  plan_id: string;
  expected_end_date: string;
}

export interface NewReminder {
  organizationId: string;
  assignmentId: string;
  expectedEndDate: BusinessDate;
  audience: ReminderAudience;
  recipientEmployeeId: string;
  departmentId: string | null;
}

export interface ReminderRow {
  id: string;
  assignmentId: string;
  audience: ReminderAudience;
  expectedEndDate: BusinessDate;
  recipientEmployeeId: string;
  holderEmployeeId: string;
  planId: string;
  createdAt: Date;
}

export interface ReminderFilter {
  recipientEmployeeId?: string;
  audience?: ReminderAudience;
  assignmentId?: string;
}

/** How many reminders a right can be owed for one end date: the holder, the head and the IT Admin. */
const AUDIENCES = 3;

/**
 * The one writer of `assignment_expiry_reminders` and the reads of it: the rights that are due a reminder, the reminders written
 * once for a right, an end date and a person, and the page of them a person reads. A reminder is never changed or deleted.
 */
@Injectable()
export class ExpiryReminderRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The open personal rights whose end date falls between two days and that lack a reminder for some audience, the earliest end
   * first. A right whose department has no head keeps coming back, because only two reminders can be written for it: that costs
   * one look at the organization for each pass and writes nothing.
   */
  async candidates(range: { from: BusinessDate; to: BusinessDate }, take: number): Promise<ReminderCandidate[]> {
    const rows = await this.prisma.$queryRaw<RawCandidate[]>`
      SELECT a.id AS assignment_id, a.organization_id, a.employee_id, a.plan_id,
             to_char(a.expected_end_date, 'YYYY-MM-DD') AS expected_end_date
        FROM license_assignments a
       WHERE a.kind = 'PERSONAL' AND a.valid_until IS NULL AND a.failed_at IS NULL AND a.cancelled_at IS NULL
         AND a.expected_end_date BETWEEN ${range.from}::date AND ${range.to}::date
         AND (SELECT count(*) FROM assignment_expiry_reminders r
               WHERE r.assignment_id = a.id AND r.expected_end_date = a.expected_end_date) < ${AUDIENCES}
       ORDER BY a.expected_end_date, a.id
       LIMIT ${take}`;

    return rows.map((row) => ({
      assignmentId: row.assignment_id,
      organizationId: row.organization_id,
      employeeId: row.employee_id,
      planId: row.plan_id,
      expectedEndDate: row.expected_end_date,
    }));
  }

  /** Writes the reminders and returns only those that were new: another instance may have written the same one a moment before. */
  async insertMany(tx: DbTx, reminders: readonly NewReminder[]): Promise<NewReminder[]> {
    if (reminders.length === 0) return [];
    const written = await tx.assignmentExpiryReminder.createManyAndReturn({
      data: reminders.map((reminder) => ({
        organizationId: reminder.organizationId,
        assignmentId: reminder.assignmentId,
        expectedEndDate: toDateColumn(reminder.expectedEndDate),
        audience: reminder.audience,
        recipientEmployeeId: reminder.recipientEmployeeId,
        departmentId: reminder.departmentId,
      })),
      skipDuplicates: true,
      select: { assignmentId: true, expectedEndDate: true, audience: true },
    });
    const key = (assignmentId: string, end: string, audience: string) => `${assignmentId}|${end}|${audience}`;
    const kept = new Set(
      written.map((row) => key(row.assignmentId, fromDateColumn(row.expectedEndDate), row.audience)),
    );

    return reminders.filter((reminder) =>
      kept.has(key(reminder.assignmentId, reminder.expectedEndDate, reminder.audience)),
    );
  }

  /** One page of reminders, the newest first and then by id, and the total, read from one snapshot. */
  async page(filter: ReminderFilter, skip: number, take: number): Promise<{ rows: ReminderRow[]; total: number }> {
    const where: Prisma.AssignmentExpiryReminderWhereInput = {
      ...(filter.recipientEmployeeId ? { recipientEmployeeId: filter.recipientEmployeeId } : {}),
      ...(filter.audience ? { audience: filter.audience } : {}),
      ...(filter.assignmentId ? { assignmentId: filter.assignmentId } : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.assignmentExpiryReminder.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip,
          take,
          select: {
            id: true,
            assignmentId: true,
            audience: true,
            expectedEndDate: true,
            recipientEmployeeId: true,
            createdAt: true,
            assignment: { select: { employeeId: true, planId: true } },
          },
        });
        const total = await tx.assignmentExpiryReminder.count({ where });

        return {
          rows: rows.map((row) => ({
            id: row.id,
            assignmentId: row.assignmentId,
            audience: row.audience,
            expectedEndDate: fromDateColumn(row.expectedEndDate),
            recipientEmployeeId: row.recipientEmployeeId,
            holderEmployeeId: row.assignment.employeeId,
            planId: row.assignment.planId,
            createdAt: row.createdAt,
          })),
          total,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
