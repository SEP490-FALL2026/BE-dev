import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ghostSeatEvidenceJson } from './ghost-seat-evidence.json';
import type {
  GhostSeatCloseReason,
  GhostSeatGroup,
  GhostSeatRecord,
  GhostSeatState,
  GhostSeatTier,
  NewGhostSeat,
} from './ghost-seat.types';

/** What a recommendation may change after it is made (its evidence never changes: a trigger). */
export interface GhostSeatPatch {
  state?: GhostSeatState;
  closeReason?: GhostSeatCloseReason;
  freeSeats?: number;
  revocationTaskId?: string | null;
  holderLeftOn?: BusinessDate;
  closedAt?: Date;
  closedByAppUserId?: string | null;
  supersededById?: string;
}

export interface GhostSeatFilter {
  group?: GhostSeatGroup;
  tier?: GhostSeatTier;
  state?: GhostSeatState;
  applicationId?: string;
  /** Only the recommendations of these departments, and the ones that belong to none (`G1`). */
  departmentIds?: readonly string[];
}

type Row = Prisma.GhostSeatRecommendationGetPayload<object>;

const toRecord = (row: Row): GhostSeatRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  group: row.group,
  state: row.state,
  closeReason: row.closeReason,
  tier: row.tier,
  applicationId: row.applicationId,
  planId: row.planId,
  subscriptionId: row.subscriptionId,
  assignmentId: row.assignmentId,
  seatChainId: row.seatChainId,
  employeeId: row.employeeId,
  departmentId: row.departmentId,
  freeSeats: row.freeSeats,
  countsTowardVacantCost: row.countsTowardVacantCost,
  revocationTaskId: row.revocationTaskId,
  holderLeftOn: row.holderLeftOn ? fromDateColumn(row.holderLeftOn) : null,
  evidence: ghostSeatEvidenceJson.decode(row.evidence),
  createdRunId: row.createdRunId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  closedAt: row.closedAt,
  closedByAppUserId: row.closedByAppUserId,
  supersededById: row.supersededById,
});

const whereOf = (organizationId: string, filter: GhostSeatFilter): Prisma.GhostSeatRecommendationWhereInput => ({
  organizationId,
  ...(filter.group ? { group: filter.group } : {}),
  ...(filter.tier ? { tier: filter.tier } : {}),
  ...(filter.state ? { state: filter.state } : {}),
  ...(filter.applicationId ? { applicationId: filter.applicationId } : {}),
  ...(filter.departmentIds
    ? { OR: [{ departmentId: null }, { departmentId: { in: [...filter.departmentIds] } }] }
    : {}),
});

/** All the SQL of the recommendations. */
@Injectable()
export class GhostSeatRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewGhostSeat): Promise<GhostSeatRecord> {
    const row = await tx.ghostSeatRecommendation.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        organizationId: input.organizationId,
        group: input.group,
        state: input.state,
        tier: input.tier,
        applicationId: input.applicationId,
        planId: input.planId,
        subscriptionId: input.subscriptionId,
        assignmentId: input.assignmentId,
        seatChainId: input.seatChainId,
        employeeId: input.employeeId,
        departmentId: input.departmentId,
        freeSeats: input.freeSeats,
        countsTowardVacantCost: input.countsTowardVacantCost,
        revocationTaskId: input.revocationTaskId,
        evidence: ghostSeatEvidenceJson.encode(input.evidence),
        createdRunId: input.createdRunId,
      },
    });

    return toRecord(row);
  }

  /** The recommendation locked `FOR UPDATE` until the transaction ends, or null. Services lock it before they call licensing. */
  async lock(tx: DbTx, id: string): Promise<GhostSeatRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "ghost_seat_recommendations" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  /**
   * The unclosed recommendations a revocation task is linked to, locked `FOR UPDATE SKIP LOCKED`: the listener runs inside the
   * transaction of licensing, which already holds the task, so it never waits for a recommendation another transaction holds (`DA6-23`).
   */
  async lockUnclosedOfTask(tx: DbTx, taskId: string): Promise<GhostSeatRecord[]> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "ghost_seat_recommendations"
       WHERE "revocation_task_id" = ${taskId}::uuid AND "state" <> 'CLOSED'
         FOR UPDATE SKIP LOCKED`;
    if (locked.length === 0) return [];
    const rows = await tx.ghostSeatRecommendation.findMany({ where: { id: { in: locked.map((row) => row.id) } } });

    return rows.map(toRecord);
  }

  async find(id: string, tx?: DbTx): Promise<GhostSeatRecord | null> {
    const row = await (tx ?? this.prisma).ghostSeatRecommendation.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  async update(tx: DbTx, id: string, patch: GhostSeatPatch): Promise<GhostSeatRecord> {
    const row = await tx.ghostSeatRecommendation.update({
      where: { id },
      data: {
        ...(patch.state ? { state: patch.state } : {}),
        ...(patch.closeReason ? { closeReason: patch.closeReason } : {}),
        ...(patch.freeSeats !== undefined ? { freeSeats: patch.freeSeats } : {}),
        ...(patch.revocationTaskId !== undefined ? { revocationTaskId: patch.revocationTaskId } : {}),
        ...(patch.holderLeftOn ? { holderLeftOn: toDateColumn(patch.holderLeftOn) } : {}),
        ...(patch.closedAt ? { closedAt: patch.closedAt } : {}),
        ...(patch.closedByAppUserId !== undefined ? { closedByAppUserId: patch.closedByAppUserId } : {}),
        ...(patch.supersededById ? { supersededById: patch.supersededById } : {}),
        updatedAt: new Date(),
      },
    });

    return toRecord(row);
  }

  /** The `G1` that are not closed, one for each subscription (the partial unique index): what a run compares the vacancies with. */
  async unclosedG1(organizationId: string, tx?: DbTx): Promise<GhostSeatRecord[]> {
    const rows = await (tx ?? this.prisma).ghostSeatRecommendation.findMany({
      where: { organizationId, group: 'G1', state: { not: 'CLOSED' } },
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  /** The recommendations about seats (not `G1`) that are not closed, one for each seat chain: what gate 8 and the clean-up read. */
  async unclosedOfSeats(organizationId: string, tx?: DbTx): Promise<GhostSeatRecord[]> {
    const rows = await (tx ?? this.prisma).ghostSeatRecommendation.findMany({
      where: { organizationId, group: { not: 'G1' }, state: { not: 'CLOSED' } },
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  async page(
    organizationId: string,
    filter: GhostSeatFilter,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: GhostSeatRecord[]; total: number }> {
    const db = tx ?? this.prisma;
    const where = whereOf(organizationId, filter);
    const rows = await db.ghostSeatRecommendation.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: page.skip,
      take: page.take,
    });
    const total = await db.ghostSeatRecommendation.count({ where });

    return { items: rows.map(toRecord), total };
  }

  /** How many recommendations are not closed in each group, and how many of the `G2` are under way: the summary and the dashboard. */
  async countUnclosed(
    organizationId: string,
    tx?: DbTx,
  ): Promise<{ group: GhostSeatGroup; state: GhostSeatState; count: number }[]> {
    const rows = await (tx ?? this.prisma).ghostSeatRecommendation.groupBy({
      by: ['group', 'state'],
      where: { organizationId, state: { not: 'CLOSED' } },
      _count: { _all: true },
    });

    return rows.map((row) => ({ group: row.group, state: row.state, count: row._count._all }));
  }

  /** What `KPI-5` counts: the recommendations made in the period, with how each ended. */
  async madeBetween(organizationId: string, from: Date, to: Date, tx?: DbTx) {
    return (tx ?? this.prisma).ghostSeatRecommendation.findMany({
      where: { organizationId, createdAt: { gte: from, lt: to } },
      select: { group: true, tier: true, state: true, closeReason: true },
    });
  }
}
