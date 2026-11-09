import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ghostSeatEvidenceJson, type GhostSeatEvidence } from './ghost-seat-evidence.json';
import { QUEUE_STATES } from './ghost-seat-state.policy';
import type {
  GhostSeatCloseReason,
  GhostSeatConfidence,
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
  deciderDepartmentId?: string | null;
  routedAt?: Date | null;
  decisionDueOn?: BusinessDate | null;
  overdueNoticedAt?: Date | null;
  returnCount?: number;
  revocationNotBefore?: BusinessDate | null;
  pausedAt?: Date | null;
  pauseTransferId?: string | null;
  /** A `MONITOR` that is still `OPEN` is re-read by the weekly pass: its tier, evidence and numbers follow the seat (a trigger allows only that). */
  tier?: GhostSeatTier;
  evidence?: GhostSeatEvidence;
  confidence?: GhostSeatConfidence;
  inactiveDays?: number | null;
  lastActiveDate?: BusinessDate | null;
  activityAfterDecisionOn?: BusinessDate | null;
}

export interface GhostSeatFilter {
  group?: GhostSeatGroup;
  tier?: GhostSeatTier;
  state?: GhostSeatState;
  applicationId?: string;
  /** Only the recommendations of these department ids, and the ones that belong to none (`G1`). */
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
  deciderDepartmentId: row.deciderDepartmentId,
  routedAt: row.routedAt,
  decisionDueOn: row.decisionDueOn ? fromDateColumn(row.decisionDueOn) : null,
  overdueNoticedAt: row.overdueNoticedAt,
  returnCount: row.returnCount,
  revocationNotBefore: row.revocationNotBefore ? fromDateColumn(row.revocationNotBefore) : null,
  pausedAt: row.pausedAt,
  pauseTransferId: row.pauseTransferId,
  usage:
    row.confidence && row.activityStatus
      ? {
          confidence: row.confidence,
          activityStatus: row.activityStatus,
          inactiveDays: row.inactiveDays,
          lastActiveDate: row.lastActiveDate ? fromDateColumn(row.lastActiveDate) : null,
          previousRecommendationId: row.previousRecommendationId,
        }
      : null,
  activityAfterDecisionOn: row.activityAfterDecisionOn ? fromDateColumn(row.activityAfterDecisionOn) : null,
});

const DATE_COLUMNS: ReadonlySet<string> = new Set([
  'holderLeftOn',
  'decisionDueOn',
  'revocationNotBefore',
  'lastActiveDate',
  'activityAfterDecisionOn',
]);

/** The columns a patch sets: every key it gives (not `undefined`), the business days turned into date columns. */
function dataOf(patch: GhostSeatPatch): Prisma.GhostSeatRecommendationUncheckedUpdateInput {
  const entries = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]): [string, unknown] => [
      key,
      key === 'evidence'
        ? ghostSeatEvidenceJson.encode(value as GhostSeatEvidence)
        : DATE_COLUMNS.has(key) && typeof value === 'string'
          ? toDateColumn(value)
          : value,
    ]);

  return Object.fromEntries(entries);
}

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
        ...(input.pause ? { pausedAt: input.pause.at, pauseTransferId: input.pause.transferId } : {}),
        ...(input.usage
          ? {
              confidence: input.usage.confidence,
              activityStatus: input.usage.activityStatus,
              inactiveDays: input.usage.inactiveDays,
              lastActiveDate: input.usage.lastActiveDate ? toDateColumn(input.usage.lastActiveDate) : null,
              previousRecommendationId: input.usage.previousRecommendationId,
            }
          : {}),
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

  /** The recommendation locked `FOR UPDATE SKIP LOCKED`, or null when it is gone or another transaction holds it: what a job does, so it never waits. */
  async lockOrSkip(tx: DbTx, id: string): Promise<GhostSeatRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "ghost_seat_recommendations" WHERE "id" = ${id}::uuid FOR UPDATE SKIP LOCKED`;

    return locked.length === 0 ? null : this.find(id, tx);
  }

  /** Several recommendations locked `FOR UPDATE` in ascending id order (so two callers never wait for each other, `DA6-23`), by id. */
  async lockMany(tx: DbTx, ids: readonly string[]): Promise<Map<string, GhostSeatRecord>> {
    const sorted = [...new Set(ids)].sort();
    if (sorted.length === 0) return new Map();
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "ghost_seat_recommendations" WHERE "id" = ANY(${sorted}::uuid[]) ORDER BY "id" FOR UPDATE`;
    const rows = await tx.ghostSeatRecommendation.findMany({ where: { id: { in: locked.map((row) => row.id) } } });

    return new Map(rows.map((row) => [row.id, toRecord(row)]));
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

  /** The recommendations with these ids, unlocked, by id order. */
  async findMany(ids: readonly string[], tx?: DbTx): Promise<GhostSeatRecord[]> {
    if (ids.length === 0) return [];
    const rows = await (tx ?? this.prisma).ghostSeatRecommendation.findMany({
      where: { id: { in: [...ids] } },
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  async find(id: string, tx?: DbTx): Promise<GhostSeatRecord | null> {
    const row = await (tx ?? this.prisma).ghostSeatRecommendation.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  async update(tx: DbTx, id: string, patch: GhostSeatPatch): Promise<GhostSeatRecord> {
    const row = await tx.ghostSeatRecommendation.update({
      where: { id },
      data: { ...dataOf(patch), updatedAt: new Date() },
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

  /** For each of these seat chains, the newest recommendation a head kept or exempted: what a new one follows (`US-10-08` AC-2). */
  async lastKeptOrExemptedOf(
    seatChainIds: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, { id: string; closeReason: 'KEPT' | 'EXEMPTED'; closedOn: BusinessDate }>> {
    if (seatChainIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).ghostSeatRecommendation.findMany({
      where: { seatChainId: { in: [...seatChainIds] }, state: 'CLOSED', closeReason: { in: ['KEPT', 'EXEMPTED'] } },
      orderBy: [{ closedAt: 'desc' }, { id: 'asc' }],
      select: { id: true, seatChainId: true, closeReason: true, closedAt: true },
    });
    const out = new Map<string, { id: string; closeReason: 'KEPT' | 'EXEMPTED'; closedOn: BusinessDate }>();
    for (const row of rows) {
      if (!row.seatChainId || out.has(row.seatChainId) || !row.closedAt) continue;
      out.set(row.seatChainId, {
        id: row.id,
        closeReason: row.closeReason as 'KEPT' | 'EXEMPTED',
        closedOn: row.closedAt.toISOString().slice(0, 10),
      });
    }

    return out;
  }

  /** The `G3`/`G4` recommendations of an application that are not closed, by id. */
  async unclosedUsageOfApplication(
    organizationId: string,
    applicationId: string,
    tx?: DbTx,
  ): Promise<GhostSeatRecord[]> {
    const rows = await (tx ?? this.prisma).ghostSeatRecommendation.findMany({
      where: { organizationId, applicationId, group: { in: ['G3', 'G4'] }, state: { not: 'CLOSED' } },
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  /** The `G3`/`G4` recommendations in these states, oldest first: what the follow-up job walks. */
  async ofStates(organizationId: string, states: readonly GhostSeatState[], tx?: DbTx): Promise<GhostSeatRecord[]> {
    const rows = await (tx ?? this.prisma).ghostSeatRecommendation.findMany({
      where: { organizationId, group: { in: ['G3', 'G4'] }, state: { in: [...states] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** The queue of a department's head: what waits for them or was returned to them, a person's rows together, oldest first. */
  async queuePage(
    organizationId: string,
    departmentId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: GhostSeatRecord[]; total: number }> {
    const db = tx ?? this.prisma;
    const where = this.queueWhere(organizationId, departmentId);
    const rows = await db.ghostSeatRecommendation.findMany({
      where,
      orderBy: [{ employeeId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      skip: page.skip,
      take: page.take,
    });
    const total = await db.ghostSeatRecommendation.count({ where });

    return { items: rows.map(toRecord), total };
  }

  /** How many recommendations wait in the queue of a department (what its head's dashboard counts). */
  countQueue(organizationId: string, departmentId: string, tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).ghostSeatRecommendation.count({ where: this.queueWhere(organizationId, departmentId) });
  }

  private queueWhere(organizationId: string, departmentId: string): Prisma.GhostSeatRecommendationWhereInput {
    return { organizationId, deciderDepartmentId: departmentId, state: { in: [...QUEUE_STATES] } };
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
