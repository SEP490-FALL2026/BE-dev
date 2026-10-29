import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BusinessDate, fromDateColumn } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { NewOrganizationChange } from '../public/organization.types';

export type AnnouncementKind = NewOrganizationChange['kind'];
type Change<Kind extends AnnouncementKind> = NewOrganizationChange & { kind: Kind };

/** What names a change in the table of announcements: the placement, the head period or the employee it is about. */
export function subjectOf(change: NewOrganizationChange): string {
  switch (change.kind) {
    case 'PLACEMENT_START':
      return change.placementId;
    case 'HEAD_PERIOD_START':
    case 'HEAD_PERIOD_END':
      return change.periodId;
    case 'EMPLOYEE_LEFT':
      return change.employeeId;
  }
}

/**
 * The one writer of `organization_change_announcements` and the reader of what has taken effect and not been told yet
 * (`FR-3.16`): the placements that began after another, the head periods that began or ended.
 */
@Injectable()
export class AnnouncementRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records the change as told and gives it its identity; null when it was told already, whoever told it (the unique key
   * waits for a concurrent teller to commit, so exactly one of them gets the row).
   */
  async record(tx: DbTx, change: NewOrganizationChange): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO organization_change_announcements (id, organization_id, kind, subject_id, effective_on)
      SELECT ${randomUUID()}::uuid, o.id, ${change.kind}::"OrganizationChangeKind", ${subjectOf(change)}::uuid,
             ${change.effectiveOn}::date
        FROM organizations o LIMIT 1
      ON CONFLICT (kind, subject_id) DO NOTHING
      RETURNING id`;

    return rows[0]?.id ?? null;
  }

  /** The placements that began on or before `today` after another one of the person and have not been told (ids, oldest first). */
  async duePlacementIds(today: BusinessDate, limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM employee_placements p
       WHERE p.valid_from <= ${today}::date
         AND EXISTS (SELECT 1 FROM employee_placements q WHERE q.employee_id = p.employee_id AND q.valid_to = p.valid_from)
         AND NOT EXISTS (SELECT 1 FROM organization_change_announcements a WHERE a.kind = 'PLACEMENT_START' AND a.subject_id = p.id)
       ORDER BY p.valid_from, p.id LIMIT ${limit}`;

    return rows.map((row) => row.id);
  }

  /** The head periods that began, and those that ended, on or before `today` and have not been told. */
  async dueHeadPeriodIds(today: BusinessDate, limit: number): Promise<{ starts: string[]; ends: string[] }> {
    const starts = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT h.id FROM department_head_periods h
       WHERE h.valid_from <= ${today}::date
         AND NOT EXISTS (SELECT 1 FROM organization_change_announcements a WHERE a.kind = 'HEAD_PERIOD_START' AND a.subject_id = h.id)
       ORDER BY h.valid_from, h.id LIMIT ${limit}`;
    const ends = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT h.id FROM department_head_periods h
       WHERE h.valid_to IS NOT NULL AND h.valid_to <= ${today}::date
         AND NOT EXISTS (SELECT 1 FROM organization_change_announcements a WHERE a.kind = 'HEAD_PERIOD_END' AND a.subject_id = h.id)
       ORDER BY h.valid_to, h.id LIMIT ${limit}`;

    return { starts: starts.map((row) => row.id), ends: ends.map((row) => row.id) };
  }

  /**
   * F47 (`ops:inspect`, read only): how many changes of each kind had taken effect in the calendar of their own organization
   * at `asOf` — the moment the migration that seeded this table finished — and are marked by no row of it. That seed used the
   * date of the database session instead of the organization's calendar; the roll-forward migration marks the difference, so
   * after it every count is 0. The three predicates are the ones of that migration. Counts only: no id, name or reason.
   */
  async countUnmarkedAsOf(
    tx: DbTx,
    asOf: Date,
  ): Promise<Record<'PLACEMENT_START' | 'HEAD_PERIOD_START' | 'HEAD_PERIOD_END', number>> {
    const at = asOf.toISOString();
    const rows = await tx.$queryRaw<{ kind: string; n: number }[]>`
      SELECT 'PLACEMENT_START' AS kind, count(*)::int AS n
        FROM employee_placements p
        JOIN organizations o ON o.id = p.organization_id
       WHERE p.valid_from <= (${at}::timestamptz AT TIME ZONE o.time_zone)::date
         AND EXISTS (SELECT 1 FROM employee_placements q WHERE q.employee_id = p.employee_id AND q.valid_to = p.valid_from)
         AND NOT EXISTS (SELECT 1 FROM organization_change_announcements a WHERE a.kind = 'PLACEMENT_START' AND a.subject_id = p.id)
      UNION ALL
      SELECT 'HEAD_PERIOD_START', count(*)::int
        FROM department_head_periods h
        JOIN organizations o ON o.id = h.organization_id
       WHERE h.valid_from <= (${at}::timestamptz AT TIME ZONE o.time_zone)::date
         AND NOT EXISTS (SELECT 1 FROM organization_change_announcements a WHERE a.kind = 'HEAD_PERIOD_START' AND a.subject_id = h.id)
      UNION ALL
      SELECT 'HEAD_PERIOD_END', count(*)::int
        FROM department_head_periods h
        JOIN organizations o ON o.id = h.organization_id
       WHERE h.valid_to IS NOT NULL AND h.valid_to <= (${at}::timestamptz AT TIME ZONE o.time_zone)::date
         AND NOT EXISTS (SELECT 1 FROM organization_change_announcements a WHERE a.kind = 'HEAD_PERIOD_END' AND a.subject_id = h.id)`;
    const count = (kind: string): number => rows.find((row) => row.kind === kind)?.n ?? 0;

    return {
      PLACEMENT_START: count('PLACEMENT_START'),
      HEAD_PERIOD_START: count('HEAD_PERIOD_START'),
      HEAD_PERIOD_END: count('HEAD_PERIOD_END'),
    };
  }

  /** The placement as a change, locked so it cannot move while it is told; null when it is gone, not yet begun or told. */
  async lockDuePlacement(tx: DbTx, id: string, today: BusinessDate): Promise<Change<'PLACEMENT_START'> | null> {
    const rows = await tx.$queryRaw<
      {
        id: string;
        employee_id: string;
        department_id: string;
        valid_from: Date;
        from_department_id: string | null;
      }[]
    >`
      SELECT p.id, p.employee_id, p.department_id, p.valid_from, q.department_id AS from_department_id
        FROM employee_placements p
        JOIN employee_placements q ON q.employee_id = p.employee_id AND q.valid_to = p.valid_from
       WHERE p.id = ${id}::uuid AND p.valid_from <= ${today}::date
         FOR UPDATE OF p`;
    const row = rows[0];
    if (!row) return null;

    return {
      kind: 'PLACEMENT_START',
      placementId: row.id,
      employeeId: row.employee_id,
      fromDepartmentId: row.from_department_id,
      toDepartmentId: row.department_id,
      effectiveOn: fromDateColumn(row.valid_from),
    };
  }

  /** The head period that began as a change, with whoever headed the department before; locked, null when gone or not begun. */
  async lockDueHeadStart(tx: DbTx, id: string, today: BusinessDate): Promise<Change<'HEAD_PERIOD_START'> | null> {
    const rows = await tx.$queryRaw<
      { id: string; department_id: string; employee_id: string; valid_from: Date; previous: string | null }[]
    >`
      SELECT h.id, h.department_id, h.employee_id, h.valid_from,
             (SELECT g.employee_id FROM department_head_periods g
               WHERE g.department_id = h.department_id AND g.id <> h.id AND g.valid_from < h.valid_from
               ORDER BY g.valid_from DESC LIMIT 1) AS previous
        FROM department_head_periods h
       WHERE h.id = ${id}::uuid AND h.valid_from <= ${today}::date
         FOR UPDATE OF h`;
    const row = rows[0];
    if (!row) return null;

    return {
      kind: 'HEAD_PERIOD_START',
      periodId: row.id,
      departmentId: row.department_id,
      headEmployeeId: row.employee_id,
      previousHeadEmployeeId: row.previous,
      effectiveOn: fromDateColumn(row.valid_from),
    };
  }

  /** The head period that ended as a change; locked, null when it is gone or has not ended. */
  async lockDueHeadEnd(tx: DbTx, id: string, today: BusinessDate): Promise<Change<'HEAD_PERIOD_END'> | null> {
    const rows = await tx.$queryRaw<{ id: string; department_id: string; employee_id: string; valid_to: Date }[]>`
      SELECT h.id, h.department_id, h.employee_id, h.valid_to FROM department_head_periods h
       WHERE h.id = ${id}::uuid AND h.valid_to IS NOT NULL AND h.valid_to <= ${today}::date
         FOR UPDATE OF h`;
    const row = rows[0];
    if (!row) return null;

    return {
      kind: 'HEAD_PERIOD_END',
      periodId: row.id,
      departmentId: row.department_id,
      headEmployeeId: row.employee_id,
      effectiveOn: fromDateColumn(row.valid_to),
    };
  }
}
