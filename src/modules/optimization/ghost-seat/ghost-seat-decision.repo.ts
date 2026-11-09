import { Injectable } from '@nestjs/common';
import { addDays, fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export type GhostSeatChoice = 'KEEP' | 'RECLAIM' | 'EXEMPT';

/** A decision of a head as it is written (append-only). */
export interface NewGhostSeatDecision {
  organizationId: string;
  recommendationId: string;
  choice: GhostSeatChoice;
  reason: string;
  exemptUntil: BusinessDate | null;
  decidedOn: BusinessDate;
  decidedByEmployeeId: string;
  decidedByAppUserId: string;
  deciderDepartmentId: string;
  deciderRoles: readonly string[];
  selfDecided: boolean;
  batchId: string | null;
}

export interface GhostSeatDecisionRecord extends NewGhostSeatDecision {
  id: string;
  decidedAt: Date;
}

export interface GhostSeatExemptionRecord {
  id: string;
  organizationId: string;
  seatChainId: string;
  recommendationId: string;
  decisionId: string;
  exemptUntil: BusinessDate;
  createdAt: Date;
  remindedAt: Date | null;
  endedAt: Date | null;
}

/** An exemption with the person and the software it is about. */
export interface ExemptionWithSeat extends GhostSeatExemptionRecord {
  employeeId: string | null;
  applicationId: string;
  planId: string;
}

/** The head is told this many days before an exemption ends. */
export const EXEMPTION_REMINDER_DAYS = 7;

type DecisionRow = Prisma.GhostSeatDecisionGetPayload<object>;
type ExemptionRow = Prisma.GhostSeatExemptionGetPayload<object>;

const toDecision = (row: DecisionRow): GhostSeatDecisionRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  recommendationId: row.recommendationId,
  choice: row.choice,
  reason: row.reason,
  exemptUntil: row.exemptUntil ? fromDateColumn(row.exemptUntil) : null,
  decidedOn: fromDateColumn(row.decidedOn),
  decidedAt: row.decidedAt,
  decidedByEmployeeId: row.decidedByEmployeeId,
  decidedByAppUserId: row.decidedByAppUserId,
  deciderDepartmentId: row.deciderDepartmentId,
  deciderRoles: row.deciderRoles,
  selfDecided: row.selfDecided,
  batchId: row.batchId,
});

const toExemption = (row: ExemptionRow): GhostSeatExemptionRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  seatChainId: row.seatChainId,
  recommendationId: row.recommendationId,
  decisionId: row.decisionId,
  exemptUntil: fromDateColumn(row.exemptUntil),
  createdAt: row.createdAt,
  remindedAt: row.remindedAt,
  endedAt: row.endedAt,
});

/**
 * The SQL of what happens to a recommendation after the head looks at it, shared by the queue of the heads (`decision`) and the board of
 * the IT Admin (`board`): the decisions (append-only), the one return of the IT Admin, and the exemptions the rules of `G3`/`G4` read
 * (gate 7). It sits beside the recommendations so neither of the two capabilities reaches into the other.
 */
@Injectable()
export class GhostSeatDecisionRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insertDecision(tx: DbTx, input: NewGhostSeatDecision): Promise<GhostSeatDecisionRecord> {
    const row = await tx.ghostSeatDecision.create({
      data: {
        organizationId: input.organizationId,
        recommendationId: input.recommendationId,
        choice: input.choice,
        reason: input.reason,
        exemptUntil: input.exemptUntil ? toDateColumn(input.exemptUntil) : null,
        decidedOn: toDateColumn(input.decidedOn),
        decidedByEmployeeId: input.decidedByEmployeeId,
        decidedByAppUserId: input.decidedByAppUserId,
        deciderDepartmentId: input.deciderDepartmentId,
        deciderRoles: [...input.deciderRoles],
        selfDecided: input.selfDecided,
        batchId: input.batchId,
      },
    });

    return toDecision(row);
  }

  async insertExemption(
    tx: DbTx,
    input: {
      organizationId: string;
      seatChainId: string;
      recommendationId: string;
      decisionId: string;
      exemptUntil: BusinessDate;
    },
  ): Promise<GhostSeatExemptionRecord> {
    const row = await tx.ghostSeatExemption.create({
      data: {
        organizationId: input.organizationId,
        seatChainId: input.seatChainId,
        recommendationId: input.recommendationId,
        decisionId: input.decisionId,
        exemptUntil: toDateColumn(input.exemptUntil),
      },
    });

    return toExemption(row);
  }

  async insertReturn(
    tx: DbTx,
    input: { recommendationId: string; reason: string; returnedByAppUserId: string; taskId: string | null },
  ): Promise<void> {
    await tx.ghostSeatReturn.create({ data: input });
  }

  /** The latest decision of each recommendation, by recommendation id (the queue shows what the head chose before a return). */
  async latestDecisionsOf(
    recommendationIds: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, GhostSeatDecisionRecord>> {
    if (recommendationIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).ghostSeatDecision.findMany({
      where: { recommendationId: { in: [...recommendationIds] } },
      orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
    });

    return new Map(rows.map((row) => [row.recommendationId, toDecision(row)]));
  }

  /** The latest decision to reclaim of a recommendation: whose decision a reclaim opened again after a failure carries (`QĐ-64a`). */
  async latestReclaimOf(recommendationId: string, tx?: DbTx): Promise<GhostSeatDecisionRecord | null> {
    const row = await (tx ?? this.prisma).ghostSeatDecision.findFirst({
      where: { recommendationId, choice: 'RECLAIM' },
      orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
    });

    return row ? toDecision(row) : null;
  }

  /** The reasons of the IT Admin for returning, by recommendation id. */
  async returnsOf(
    recommendationIds: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, { reason: string; returnedAt: Date }>> {
    if (recommendationIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).ghostSeatReturn.findMany({
      where: { recommendationId: { in: [...recommendationIds] } },
    });

    return new Map(rows.map((row) => [row.recommendationId, { reason: row.reason, returnedAt: row.returnedAt }]));
  }

  /** For each of these seat chains, the last day of the exemption that is still running on `today` (gate 7 of `G3`/`G4`); a chain with none is absent. */
  async runningExemptionOf(
    seatChainIds: readonly string[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, BusinessDate>> {
    if (seatChainIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).ghostSeatExemption.findMany({
      where: { seatChainId: { in: [...seatChainIds] }, endedAt: null, exemptUntil: { gte: toDateColumn(today) } },
      select: { seatChainId: true, exemptUntil: true },
    });
    const out = new Map<string, BusinessDate>();
    for (const row of rows) {
      const until = fromDateColumn(row.exemptUntil);
      const known = out.get(row.seatChainId);
      if (!known || until > known) out.set(row.seatChainId, until);
    }

    return out;
  }

  /** The exemptions that end within a week and were not reminded: the head of the holder's department is told once (`US-10-08` AC-1). */
  async exemptionsToRemind(
    organizationId: string,
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<GhostSeatExemptionRecord[]> {
    const rows = await (tx ?? this.prisma).ghostSeatExemption.findMany({
      where: {
        organizationId,
        remindedAt: null,
        endedAt: null,
        exemptUntil: { gte: toDateColumn(today), lte: toDateColumn(addDays(today, EXEMPTION_REMINDER_DAYS)) },
      },
      orderBy: [{ exemptUntil: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toExemption);
  }

  async markReminded(tx: DbTx, id: string, at: Date): Promise<void> {
    await tx.ghostSeatExemption.update({ where: { id }, data: { remindedAt: at } });
  }

  /** The exemptions whose last day is past are over: the rules of `G3`/`G4` judge the seat again (`US-10-08` AC-6, AC-7). Returns how many. */
  async endExpired(organizationId: string, today: BusinessDate, at: Date, tx?: DbTx): Promise<number> {
    const done = await (tx ?? this.prisma).ghostSeatExemption.updateMany({
      where: { organizationId, endedAt: null, exemptUntil: { lt: toDateColumn(today) } },
      data: { endedAt: at },
    });

    return done.count;
  }

  /** One page of the decisions, newest first; `selfDecided` keeps the ones a head made on their own seat (the report of the Super Admin, `US-10-03` AC-13). */
  async decisionsPage(
    organizationId: string,
    filter: { selfDecided?: boolean },
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: GhostSeatDecisionRecord[]; total: number }> {
    const db = tx ?? this.prisma;
    const where = { organizationId, ...(filter.selfDecided === undefined ? {} : { selfDecided: filter.selfDecided }) };
    const rows = await db.ghostSeatDecision.findMany({
      where,
      orderBy: [{ decidedAt: 'desc' }, { id: 'asc' }],
      skip: page.skip,
      take: page.take,
    });

    return { items: rows.map(toDecision), total: await db.ghostSeatDecision.count({ where }) };
  }

  /** One page of the exemptions with the seat they are about, newest first; limited to one department when the reader is its head. */
  async exemptionsPage(
    organizationId: string,
    filter: { departmentId?: string },
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: ExemptionWithSeat[]; total: number }> {
    const db = tx ?? this.prisma;
    const where = {
      organizationId,
      ...(filter.departmentId ? { recommendation: { deciderDepartmentId: filter.departmentId } } : {}),
    };
    const rows = await db.ghostSeatExemption.findMany({
      where,
      include: { recommendation: { select: { employeeId: true, applicationId: true, planId: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: page.skip,
      take: page.take,
    });

    return {
      items: rows.map((row) => ({
        ...toExemption(row),
        employeeId: row.recommendation.employeeId,
        applicationId: row.recommendation.applicationId,
        planId: row.recommendation.planId,
      })),
      total: await db.ghostSeatExemption.count({ where }),
    };
  }
}
