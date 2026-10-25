import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { PendingPersonnelFile, PersonnelFileKind, ServiceAccountDuty } from '../licensing-service-account.types';

/** An open service account joined to the file that waits on the person who answers for it. */
export interface DutyRow {
  assignmentId: string;
  employeeId: string;
  planId: string;
  owningDepartmentId: string | null;
  accountIdentifier: string;
  dueOn: BusinessDate;
  fileKind: PersonnelFileKind;
  fileId: string;
}

interface RawDutyRow {
  assignment_id: string;
  employee_id: string;
  plan_id: string;
  owning_department_id: string | null;
  account_identifier: string;
  due_on: string;
  file_kind: PersonnelFileKind;
  file_id: string;
}

const toRow = (row: RawDutyRow): DutyRow => ({
  assignmentId: row.assignment_id,
  employeeId: row.employee_id,
  planId: row.plan_id,
  owningDepartmentId: row.owning_department_id,
  accountIdentifier: row.account_identifier,
  dueOn: row.due_on,
  fileKind: row.file_kind,
  fileId: row.file_id,
});

/** The columns of the files as parallel arrays, the shape `unnest` joins on. */
const columnsOf = (files: readonly PendingPersonnelFile[]) => ({
  ids: files.map((file) => file.employeeId),
  days: files.map((file) => file.dueOn),
  kinds: files.map((file) => file.fileKind),
  fileIds: files.map((file) => file.fileId),
});

/**
 * Reads the service accounts that wait for a person (`US-03-08`) and keeps the reminders written for them. A duty is not a row of its
 * own: it is an open service account whose person has a file that waits, so every read here is a join of `license_assignments` with
 * the people of the files, in a fixed number of statements however many files there are.
 */
@Injectable()
export class ServiceAccountDutyRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The service accounts these people answer for that are still open (a future start included), oldest first. */
  async openOf(employeeIds: readonly string[], tx?: DbTx): Promise<ServiceAccountDuty[]> {
    if (employeeIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).licenseAssignment.findMany({
      where: {
        kind: 'SERVICE',
        employeeId: { in: [...employeeIds] },
        failedAt: null,
        cancelledAt: null,
        validUntil: null,
      },
      select: { id: true, employeeId: true, planId: true, owningDepartmentId: true },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      assignmentId: row.id,
      employeeId: row.employeeId,
      planId: row.planId,
      owningDepartmentId: row.owningDepartmentId as string,
    }));
  }

  /** The people who answer for an open service account, by id, at most `limit` of them: who a personnel file can be waiting on. */
  async peopleAnswering(limit: number): Promise<string[]> {
    const groups = await this.prisma.licenseAssignment.groupBy({
      by: ['employeeId'],
      where: { kind: 'SERVICE', failedAt: null, cancelledAt: null, validUntil: null },
      orderBy: { employeeId: 'asc' },
      take: limit,
    });

    return groups.map((group) => group.employeeId);
  }

  /**
   * One page of the open service accounts of the people of these files, the earliest day first and then by assignment, and the
   * total, from one snapshot. `overdue` keeps only the accounts whose day is before `today` (true) or not (false).
   */
  async page(
    files: readonly PendingPersonnelFile[],
    filter: { today: BusinessDate; overdue?: boolean },
    skip: number,
    take: number,
  ): Promise<{ rows: DutyRow[]; total: number }> {
    if (files.length === 0) return { rows: [], total: 0 };
    const { ids, days, kinds, fileIds } = columnsOf(files);
    const overdue = filter.overdue ?? null;

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<RawDutyRow[]>`
          WITH due AS (
            SELECT * FROM unnest(${ids}::uuid[], ${days}::date[], ${kinds}::text[], ${fileIds}::uuid[])
              AS d(employee_id, due_on, file_kind, file_id)
          )
          SELECT a.id AS assignment_id, a.employee_id, a.plan_id, a.owning_department_id, a.account_identifier,
                 to_char(d.due_on, 'YYYY-MM-DD') AS due_on, d.file_kind, d.file_id
            FROM license_assignments a JOIN due d ON d.employee_id = a.employee_id
           WHERE a.kind = 'SERVICE' AND a.failed_at IS NULL AND a.cancelled_at IS NULL AND a.valid_until IS NULL
             AND (${overdue}::boolean IS NULL OR (d.due_on < ${filter.today}::date) = ${overdue}::boolean)
           ORDER BY d.due_on, a.id
           LIMIT ${take} OFFSET ${skip}`;
        const counted = await tx.$queryRaw<{ total: bigint }[]>`
          WITH due AS (
            SELECT * FROM unnest(${ids}::uuid[], ${days}::date[]) AS d(employee_id, due_on)
          )
          SELECT count(*) AS total
            FROM license_assignments a JOIN due d ON d.employee_id = a.employee_id
           WHERE a.kind = 'SERVICE' AND a.failed_at IS NULL AND a.cancelled_at IS NULL AND a.valid_until IS NULL
             AND (${overdue}::boolean IS NULL OR (d.due_on < ${filter.today}::date) = ${overdue}::boolean)`;

        return { rows: rows.map(toRow), total: Number(counted[0]?.total ?? 0) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The open service accounts of the people of these files whose day has passed and that no reminder was written for yet. */
  async unnoticed(files: readonly PendingPersonnelFile[], take: number): Promise<DutyRow[]> {
    if (files.length === 0) return [];
    const { ids, days, kinds, fileIds } = columnsOf(files);
    const rows = await this.prisma.$queryRaw<RawDutyRow[]>`
      WITH due AS (
        SELECT * FROM unnest(${ids}::uuid[], ${days}::date[], ${kinds}::text[], ${fileIds}::uuid[])
          AS d(employee_id, due_on, file_kind, file_id)
      )
      SELECT a.id AS assignment_id, a.employee_id, a.plan_id, a.owning_department_id, a.account_identifier,
             to_char(d.due_on, 'YYYY-MM-DD') AS due_on, d.file_kind, d.file_id
        FROM license_assignments a JOIN due d ON d.employee_id = a.employee_id
       WHERE a.kind = 'SERVICE' AND a.failed_at IS NULL AND a.cancelled_at IS NULL AND a.valid_until IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM service_account_duty_notices n WHERE n.assignment_id = a.id AND n.due_on = d.due_on
         )
       ORDER BY d.due_on, a.id
       LIMIT ${take}`;

    return rows.map(toRow);
  }

  /** Writes the reminder of an assignment and a day once: false when it was written already (another instance was first). */
  async insertNotice(tx: DbTx, assignmentId: string, dueOn: BusinessDate): Promise<boolean> {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO service_account_duty_notices (id, assignment_id, due_on)
      VALUES (gen_random_uuid(), ${assignmentId}::uuid, ${dueOn}::date)
      ON CONFLICT (assignment_id, due_on) DO NOTHING
      RETURNING id`;

    return inserted.length > 0;
  }
}
