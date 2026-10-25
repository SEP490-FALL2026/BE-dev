import { Injectable } from '@nestjs/common';
import { BusinessDate, fromDateColumn, toDateColumn } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DepartmentHeadRecord, HeadPeriodChanges, HeadPeriodRecord } from './department.types';

/**
 * The one writer of `department_head_periods` (US-03-06 AC-5 → AC-9, US-01-02): who heads a department, on which
 * days. The database keeps one head per department per day, one department per head, and the head a member (INV-19).
 */
@Injectable()
export class DepartmentHeadRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Who heads each department on `onDate`, for the departments asked about. */
  async currentHeads(
    departmentIds: string[],
    onDate: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, DepartmentHeadRecord>> {
    if (departmentIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).$queryRaw<
      { department_id: string; employee_id: string; employee_code: string; full_name: string; valid_from: Date }[]
    >`
      SELECT h.department_id, e.id AS employee_id, e.employee_code, e.full_name, h.valid_from
        FROM department_head_periods h JOIN employees e ON e.id = h.employee_id
       WHERE h.department_id = ANY(${departmentIds}::uuid[])
         AND h.valid_from <= ${onDate}::date AND (h.valid_to IS NULL OR h.valid_to > ${onDate}::date)`;

    return new Map(
      rows.map((row) => [
        row.department_id,
        {
          employeeId: row.employee_id,
          employeeCode: row.employee_code,
          fullName: row.full_name,
          since: fromDateColumn(row.valid_from),
        },
      ]),
    );
  }

  /**
   * Who heads each department on its own day, in one read: the key is `<departmentId>|<day>`, and a department nobody heads that
   * day is absent. Several days in one statement so a list of cases decided for different days costs the same as one day.
   */
  async headsOnDates(
    queries: readonly { departmentId: string; onDate: BusinessDate }[],
    tx?: DbTx,
  ): Promise<Map<string, string>> {
    if (queries.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).$queryRaw<{ department_id: string; on_date: string; employee_id: string }[]>`
      SELECT q.department_id, to_char(q.on_date, 'YYYY-MM-DD') AS on_date, h.employee_id
        FROM unnest(${queries.map((query) => query.departmentId)}::uuid[], ${queries.map((query) => query.onDate)}::date[])
             AS q(department_id, on_date)
        JOIN department_head_periods h ON h.department_id = q.department_id
         AND h.valid_from <= q.on_date AND (h.valid_to IS NULL OR h.valid_to > q.on_date)`;

    return new Map(rows.map((row) => [`${row.department_id}|${row.on_date}`, row.employee_id]));
  }

  /** The periods in which the employee heads a department that have not ended by `from`, oldest first. */
  async periodsOf(
    employeeId: string,
    from: BusinessDate,
    tx?: DbTx,
  ): Promise<{ departmentId: string; validFrom: BusinessDate; validTo: BusinessDate | null }[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<
      { department_id: string; valid_from: Date; valid_to: Date | null }[]
    >`
      SELECT department_id, valid_from, valid_to FROM department_head_periods
       WHERE employee_id = ${employeeId}::uuid AND (valid_to IS NULL OR valid_to > ${from}::date)
       ORDER BY valid_from, id`;

    return rows.map((row) => ({
      departmentId: row.department_id,
      validFrom: fromDateColumn(row.valid_from),
      validTo: row.valid_to ? fromDateColumn(row.valid_to) : null,
    }));
  }

  /** The history of who headed the department, newest period first. */
  async headPeriods(client: DbTx | undefined, departmentId: string, limit: number): Promise<HeadPeriodRecord[]> {
    const rows = await (client ?? this.prisma).$queryRaw<
      { employee_id: string; employee_code: string; full_name: string; valid_from: Date; valid_to: Date | null }[]
    >`
      SELECT e.id AS employee_id, e.employee_code, e.full_name, h.valid_from, h.valid_to
        FROM department_head_periods h JOIN employees e ON e.id = h.employee_id
       WHERE h.department_id = ${departmentId}::uuid
       ORDER BY h.valid_from DESC, h.id LIMIT ${limit}`;

    return rows.map((row) => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      fullName: row.full_name,
      validFrom: fromDateColumn(row.valid_from),
      validTo: row.valid_to ? fromDateColumn(row.valid_to) : null,
    }));
  }

  /**
   * Makes room for a new head from `from` (the caller holds the department's `FOR UPDATE` lock): a period that has
   * not begun by then is cancelled, one in force on that day ends the day before it begins. Returns what was
   * cancelled and what was ended, for the audit event.
   */
  async makeRoomForHead(tx: DbTx, departmentId: string, from: BusinessDate): Promise<HeadPeriodChanges> {
    const cancelled = await tx.$queryRaw<
      {
        id: string;
        employee_id: string;
        employee_code: string;
        full_name: string;
        valid_from: Date;
        valid_to: Date | null;
      }[]
    >`
      WITH removed AS (
        DELETE FROM department_head_periods
         WHERE department_id = ${departmentId}::uuid AND valid_from >= ${from}::date
        RETURNING id, employee_id, valid_from, valid_to)
      SELECT r.id, e.id AS employee_id, e.employee_code, e.full_name, r.valid_from, r.valid_to
        FROM removed r JOIN employees e ON e.id = r.employee_id`;
    const ended = await tx.$queryRaw<
      {
        id: string;
        employee_id: string;
        employee_code: string;
        full_name: string;
        valid_from: Date;
        valid_to: Date | null;
      }[]
    >`
      WITH updated AS (
        UPDATE department_head_periods SET valid_to = ${from}::date
         WHERE department_id = ${departmentId}::uuid AND valid_from < ${from}::date
           AND (valid_to IS NULL OR valid_to > ${from}::date)
        RETURNING id, employee_id, valid_from, valid_to)
      SELECT u.id, e.id AS employee_id, e.employee_code, e.full_name, u.valid_from, u.valid_to
        FROM updated u JOIN employees e ON e.id = u.employee_id`;
    const toRecord = (row: (typeof cancelled)[number]): HeadPeriodRecord => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      fullName: row.full_name,
      validFrom: fromDateColumn(row.valid_from),
      validTo: row.valid_to ? fromDateColumn(row.valid_to) : null,
    });

    return {
      cancelled: cancelled.map(toRecord),
      ended: ended.map(toRecord),
      endedPeriodIds: ended.map((row) => row.id),
      cancelledPeriodIds: cancelled.map((row) => row.id),
    };
  }

  async insertHeadPeriod(
    tx: DbTx,
    input: {
      organizationId: string;
      departmentId: string;
      employeeId: string;
      validFrom: BusinessDate;
      validTo?: BusinessDate | null;
    },
  ): Promise<{ periodId: string }> {
    const created = await tx.departmentHeadPeriod.create({
      data: {
        organizationId: input.organizationId,
        departmentId: input.departmentId,
        employeeId: input.employeeId,
        validFrom: toDateColumn(input.validFrom),
        ...(input.validTo ? { validTo: toDateColumn(input.validTo) } : {}),
      },
      select: { id: true },
    });

    return { periodId: created.id };
  }

  /**
   * Ends the period in which the person heads the department across `from` on that day (the caller holds the department's
   * `FOR UPDATE` lock), and says where it ended before: null when it was open. Nothing to end gives null.
   */
  async endPeriodOf(
    tx: DbTx,
    departmentId: string,
    employeeId: string,
    from: BusinessDate,
  ): Promise<{ periodId: string; endedBefore: BusinessDate | null } | null> {
    const rows = await tx.$queryRaw<{ id: string; was: Date | null }[]>`
      WITH target AS (
        SELECT id, valid_to AS was FROM department_head_periods
         WHERE department_id = ${departmentId}::uuid AND employee_id = ${employeeId}::uuid
           AND valid_from < ${from}::date AND (valid_to IS NULL OR valid_to > ${from}::date)
           FOR UPDATE)
      UPDATE department_head_periods h SET valid_to = ${from}::date FROM target WHERE h.id = target.id
      RETURNING h.id, target.was`;

    return rows[0] ? { periodId: rows[0].id, endedBefore: rows[0].was ? fromDateColumn(rows[0].was) : null } : null;
  }

  /** Puts the end of a period back where it was before a handover ended it. */
  async restorePeriodEnd(tx: DbTx, periodId: string, validTo: BusinessDate | null): Promise<void> {
    await tx.$executeRaw`UPDATE department_head_periods SET valid_to = ${validTo}::date WHERE id = ${periodId}::uuid`;
  }

  async deletePeriod(tx: DbTx, periodId: string): Promise<void> {
    await tx.$executeRaw`DELETE FROM department_head_periods WHERE id = ${periodId}::uuid`;
  }

  /** The department the employee heads on `onDate`, if any (an unlocked read, for the per-request role check). */
  async headedDepartment(employeeId: string, onDate: BusinessDate): Promise<{ departmentId: string } | null> {
    const rows = await this.prisma.$queryRaw<{ department_id: string }[]>`
      SELECT h.department_id FROM department_head_periods h
       WHERE h.employee_id = ${employeeId}::uuid
         AND h.valid_from <= ${onDate}::date AND (h.valid_to IS NULL OR h.valid_to > ${onDate}::date)
       LIMIT 1`;

    return rows[0] ? { departmentId: rows[0].department_id } : null;
  }

  /** True when the employee heads a department now or has a head period that begins later. */
  async hasHeadPeriodFrom(client: DbTx | undefined, employeeId: string, onDate: BusinessDate): Promise<boolean> {
    const rows = await (client ?? this.prisma).$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM department_head_periods
       WHERE employee_id = ${employeeId}::uuid AND (valid_to IS NULL OR valid_to > ${onDate}::date)
       LIMIT 1`;

    return rows.length > 0;
  }
}
