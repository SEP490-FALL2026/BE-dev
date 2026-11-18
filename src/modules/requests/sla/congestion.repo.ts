import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import type { SlaStepKind } from './step-sla.policy';

/** The open steps of one holder, as the board counts them; `holderEmployeeId` is null for the steps nobody holds. */
export interface HolderLoad {
  holderEmployeeId: string | null;
  openSteps: number;
  /** Steps that were reminded at least once: how a step counts as late without the calendar. */
  remindedSteps: number;
  totalReminders: number;
  lastRemindedOn: BusinessDate | null;
  oldestCreatedAt: Date;
}

/** An open step of the list of one holder. */
export interface OpenStepRow {
  stepId: string;
  requestId: string;
  kind: SlaStepKind;
  state: 'PENDING' | 'WAITING';
  createdAt: Date;
  slaWorkingDays: number;
  reminders: number;
  lastRemindedOn: BusinessDate | null;
}

export interface IncidentRecord {
  id: string;
  holderEmployeeId: string | null;
  description: string;
  openSteps: number;
  oldestAgeWorkingDays: number;
  recordedAt: Date;
}

export interface NewIncident {
  organizationId: string;
  holderEmployeeId: string | null;
  description: string;
  openSteps: number;
  oldestAgeWorkingDays: number;
  recordedByAppUserId: string;
}

interface HolderLoadRow {
  holder_id: string | null;
  open_steps: number;
  reminded_steps: number;
  total_reminders: number;
  last_reminded_on: Date | null;
  oldest_created_at: Date;
  total: bigint;
}

/**
 * What the reminders have left behind and the steps still open, read for the backlog alert of the worker and the board of the
 * Super Admin, and the incidents the Super Admin records. It is one reader and one writer in two graphs (the worker and the API),
 * so it is declared once, in the part of the module both load. A page is a fixed number of statements however many rows it has.
 */
@Injectable()
export class CongestionRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The holders with more steps waiting on them than `threshold`, the oldest step of each: the backlog the Super Admin is told of. */
  async backlogHolders(
    threshold: number,
  ): Promise<{ holderEmployeeId: string; openSteps: number; oldestCreatedAt: Date }[]> {
    const rows = await this.prisma.$queryRaw<{ holder_id: string; open_steps: number; oldest: Date }[]>`
      SELECT s.assignee_employee_id AS holder_id, count(*)::int AS open_steps, min(s.created_at) AS oldest
        FROM access_request_steps s
       WHERE s.state = 'PENDING'
       GROUP BY s.assignee_employee_id
      HAVING count(*) > ${threshold}
       ORDER BY count(*) DESC, s.assignee_employee_id`;

    return rows.map((row) => ({
      holderEmployeeId: row.holder_id,
      openSteps: row.open_steps,
      oldestCreatedAt: row.oldest,
    }));
  }

  /** One page of the board: a row for each holder with open steps, the most steps first, and the number of holders. */
  async boardPage(skip: number, take: number): Promise<{ rows: HolderLoad[]; total: number }> {
    const rows = await this.prisma.$queryRaw<HolderLoadRow[]>`
      WITH live AS (
        SELECT s.id, s.assignee_employee_id AS holder_id, s.created_at,
               (SELECT count(*) FROM step_sla_reminders r WHERE r.subject_kind = 'STEP' AND r.subject_id = s.id) AS reminders,
               (SELECT max(r.business_date) FROM step_sla_reminders r WHERE r.subject_kind = 'STEP' AND r.subject_id = s.id) AS last_on
          FROM access_request_steps s
         WHERE s.state IN ('PENDING', 'WAITING')
      ), grouped AS (
        SELECT holder_id, count(*)::int AS open_steps,
               (count(*) FILTER (WHERE reminders > 0))::int AS reminded_steps,
               coalesce(sum(reminders), 0)::int AS total_reminders,
               max(last_on) AS last_reminded_on, min(created_at) AS oldest_created_at
          FROM live GROUP BY holder_id
      )
      SELECT g.*, count(*) OVER () AS total FROM grouped g
       ORDER BY g.open_steps DESC, g.holder_id ASC NULLS LAST
       LIMIT ${take} OFFSET ${skip}`;

    return {
      rows: rows.map((row) => ({
        holderEmployeeId: row.holder_id,
        openSteps: row.open_steps,
        remindedSteps: row.reminded_steps,
        totalReminders: row.total_reminders,
        lastRemindedOn: row.last_reminded_on ? fromDateColumn(row.last_reminded_on) : null,
        oldestCreatedAt: row.oldest_created_at,
      })),
      total: rows.length > 0 ? Number(rows[0].total) : await this.holderCountBeyond(skip),
    };
  }

  /** The number of holders when a page past the end was asked for, so the total of an empty page is still right. */
  private async holderCountBeyond(skip: number): Promise<number> {
    if (skip === 0) return 0;
    const [row] = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(DISTINCT coalesce(s.assignee_employee_id::text, '')) AS total
        FROM access_request_steps s WHERE s.state IN ('PENDING', 'WAITING')`;

    return Number(row?.total ?? 0);
  }

  /**
   * One page of the open steps of a holder (or of the steps nobody holds), the oldest first, and the total, from one snapshot; with
   * how many reminders each has had.
   */
  async stepsPage(
    holderEmployeeId: string | null,
    skip: number,
    take: number,
  ): Promise<{ rows: OpenStepRow[]; total: number }> {
    // The review of Finance is retired: an old step of that kind is closed and is never one that waits.
    const where: Prisma.AccessRequestStepWhereInput =
      holderEmployeeId === null
        ? { state: 'WAITING', assigneeEmployeeId: null, kind: { not: 'FINANCE_REVIEW' } }
        : {
            state: { in: ['PENDING', 'WAITING'] },
            assigneeEmployeeId: holderEmployeeId,
            kind: { not: 'FINANCE_REVIEW' },
          };

    return this.prisma.$transaction(
      async (tx) => {
        const steps = await tx.accessRequestStep.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: { id: true, requestId: true, kind: true, state: true, createdAt: true, slaWorkingDays: true },
        });
        const reminded =
          steps.length === 0
            ? []
            : await tx.stepSlaReminder.groupBy({
                by: ['subjectId'],
                where: { subjectKind: 'STEP', subjectId: { in: steps.map((step) => step.id) } },
                _count: { _all: true },
                _max: { businessDate: true },
              });
        const byStep = new Map(reminded.map((row) => [row.subjectId, row]));

        return {
          rows: steps.map((step): OpenStepRow => {
            const row = byStep.get(step.id);

            return {
              stepId: step.id,
              requestId: step.requestId,
              kind: step.kind as OpenStepRow['kind'],
              state: step.state as 'PENDING' | 'WAITING',
              createdAt: step.createdAt,
              slaWorkingDays: step.slaWorkingDays,
              reminders: row?._count._all ?? 0,
              lastRemindedOn: row?._max.businessDate ? fromDateColumn(row._max.businessDate) : null,
            };
          }),
          total: await tx.accessRequestStep.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** How many steps wait on the holder (or on nobody) and the creation of the oldest, as an incident records them. */
  async snapshotOf(
    tx: DbTx,
    holderEmployeeId: string | null,
  ): Promise<{ openSteps: number; oldestCreatedAt: Date | null }> {
    const where: Prisma.AccessRequestStepWhereInput =
      holderEmployeeId === null
        ? { state: 'WAITING', assigneeEmployeeId: null }
        : { state: { in: ['PENDING', 'WAITING'] }, assigneeEmployeeId: holderEmployeeId };
    const found = await tx.accessRequestStep.aggregate({ where, _count: { _all: true }, _min: { createdAt: true } });

    return { openSteps: found._count._all, oldestCreatedAt: found._min.createdAt };
  }

  async insertIncident(tx: DbTx, incident: NewIncident): Promise<IncidentRecord> {
    const row = await tx.congestionIncident.create({ data: incident });

    return {
      id: row.id,
      holderEmployeeId: row.holderEmployeeId,
      description: row.description,
      openSteps: row.openSteps,
      oldestAgeWorkingDays: row.oldestAgeWorkingDays,
      recordedAt: row.recordedAt,
    };
  }

  /** One page of the incidents, the newest first (`id` breaks a tie), with the total, from one snapshot. */
  async incidentsPage(skip: number, take: number): Promise<{ rows: IncidentRecord[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => ({
        rows: (
          await tx.congestionIncident.findMany({
            orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
            skip,
            take,
          })
        ).map((row) => ({
          id: row.id,
          holderEmployeeId: row.holderEmployeeId,
          description: row.description,
          openSteps: row.openSteps,
          oldestAgeWorkingDays: row.oldestAgeWorkingDays,
          recordedAt: row.recordedAt,
        })),
        total: await tx.congestionIncident.count(),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
