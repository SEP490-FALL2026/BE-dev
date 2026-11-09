import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ruleSkipDetailJson, type RuleSkipDetail } from './rule-run-skip-detail.json';
import { RUN_MAX_ATTEMPTS, RUN_TAKEOVER_AFTER_MS } from './rule-run.policy';

export type RuleSetCode = 'G1_G2' | 'G3_G4';
export type RunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';
export type SkipGate = 'PER_SEAT' | 'INTERNAL_SOFTWARE' | 'OPEN_RECOMMENDATION';
export type SkipSubject = 'SUBSCRIPTION' | 'ASSIGNMENT';

export interface RuleRunRecord {
  id: string;
  organizationId: string;
  ruleSet: RuleSetCode;
  periodKey: string;
  status: RunStatus;
  attempt: number;
  startedAt: Date;
  finishedAt: Date | null;
  createdCount: number;
  updatedCount: number;
  closedCount: number;
  skippedCount: number;
  failedCount: number;
  error: string | null;
}

export interface RunCounts {
  created: number;
  updated: number;
  closed: number;
  skipped: number;
  failed: number;
}

export interface RuleSkipRecord {
  id: string;
  subjectType: SkipSubject;
  subjectId: string;
  gate: SkipGate;
  detail: RuleSkipDetail;
  createdAt: Date;
}

export interface NewRuleSkip {
  subjectType: SkipSubject;
  subjectId: string;
  gate: SkipGate;
  detail: RuleSkipDetail;
}

const toRun = (row: {
  id: string;
  organizationId: string;
  ruleSet: RuleSetCode;
  periodKey: string;
  status: RunStatus;
  attempt: number;
  startedAt: Date;
  finishedAt: Date | null;
  createdCount: number;
  updatedCount: number;
  closedCount: number;
  skippedCount: number;
  failedCount: number;
  error: string | null;
}): RuleRunRecord => ({ ...row });

/** The runs of the rules and why each left a subject out. */
@Injectable()
export class RuleRunRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claims the run of a period in one statement: the first to insert wins (`ON CONFLICT DO NOTHING`); a run that died (`RUNNING` for
   * two hours) or failed, with an attempt left, is taken over by the next one (`attempt + 1`). Returns null when the period is
   * being run, is done, or has used its attempts.
   */
  async claim(
    organizationId: string,
    ruleSet: RuleSetCode,
    periodKey: string,
    now: Date,
  ): Promise<RuleRunRecord | null> {
    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "ghost_seat_rule_runs" ("organization_id", "rule_set", "period_key", "status", "attempt", "started_at")
      VALUES (${organizationId}::uuid, ${ruleSet}::"GhostSeatRuleSet", ${periodKey}, 'RUNNING', 1, ${now})
      ON CONFLICT ("organization_id", "rule_set", "period_key") DO NOTHING
      RETURNING "id"`;
    const id =
      inserted[0]?.id ??
      (
        await this.prisma.$queryRaw<{ id: string }[]>`
          UPDATE "ghost_seat_rule_runs"
             SET "status" = 'RUNNING', "attempt" = "attempt" + 1, "started_at" = ${now}, "finished_at" = NULL, "error" = NULL
           WHERE "organization_id" = ${organizationId}::uuid AND "rule_set" = ${ruleSet}::"GhostSeatRuleSet"
             AND "period_key" = ${periodKey} AND "attempt" < ${RUN_MAX_ATTEMPTS}
             AND ("status" = 'FAILED'
                  OR ("status" = 'RUNNING' AND "started_at" <= ${new Date(now.getTime() - RUN_TAKEOVER_AFTER_MS)}))
          RETURNING "id"`
      )[0]?.id;
    if (!id) return null;
    const row = await this.prisma.ghostSeatRuleRun.findUniqueOrThrow({ where: { id } });

    return toRun(row);
  }

  async finish(
    runId: string,
    status: 'COMPLETED' | 'FAILED',
    counts: RunCounts,
    now: Date,
    error?: string,
  ): Promise<void> {
    await this.prisma.ghostSeatRuleRun.update({
      where: { id: runId },
      data: {
        status,
        finishedAt: now,
        createdCount: counts.created,
        updatedCount: counts.updated,
        closedCount: counts.closed,
        skippedCount: counts.skipped,
        failedCount: counts.failed,
        error: error ? error.slice(0, 500) : null,
      },
    });
  }

  /** Keeps why subjects were left out; a subject already kept for the run is kept once (`UNIQUE (run, subject)`). */
  async recordSkips(runId: string, skips: readonly NewRuleSkip[]): Promise<void> {
    if (skips.length === 0) return;
    await this.prisma.ghostSeatRuleSkip.createMany({
      data: skips.map((skip) => ({
        runId,
        subjectType: skip.subjectType,
        subjectId: skip.subjectId,
        gate: skip.gate,
        detail: ruleSkipDetailJson.encode(skip.detail),
      })),
      skipDuplicates: true,
    });
  }

  async page(
    organizationId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: RuleRunRecord[]; total: number }> {
    const db = tx ?? this.prisma;
    const rows = await db.ghostSeatRuleRun.findMany({
      where: { organizationId },
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      skip: page.skip,
      take: page.take,
    });
    const total = await db.ghostSeatRuleRun.count({ where: { organizationId } });

    return { items: rows.map(toRun), total };
  }

  /**
   * The first `take` reasons kept for each of these runs and how many each has, in two statements however many runs there are: the
   * window numbers the reasons of each run in the order they were kept (`created_at`, `id`).
   */
  async skipsOfRuns(
    runIds: readonly string[],
    take: number,
    tx?: DbTx,
  ): Promise<Map<string, { items: RuleSkipRecord[]; total: number }>> {
    const result = new Map<string, { items: RuleSkipRecord[]; total: number }>(
      runIds.map((id) => [id, { items: [], total: 0 }]),
    );
    if (runIds.length === 0) return result;
    const db = tx ?? this.prisma;
    const rows = await db.$queryRaw<
      {
        id: string;
        run_id: string;
        subject_type: SkipSubject;
        subject_id: string;
        gate: SkipGate;
        detail: unknown;
        created_at: Date;
      }[]
    >`
      SELECT id, run_id, subject_type, subject_id, gate, detail, created_at FROM (
        SELECT s.*, row_number() OVER (PARTITION BY s."run_id" ORDER BY s."created_at", s."id") AS position
          FROM "ghost_seat_rule_skips" s WHERE s."run_id" = ANY(${[...runIds]}::uuid[])
      ) ranked WHERE position <= ${take} ORDER BY created_at, id`;
    for (const row of rows) {
      result.get(row.run_id)?.items.push({
        id: row.id,
        subjectType: row.subject_type,
        subjectId: row.subject_id,
        gate: row.gate,
        detail: ruleSkipDetailJson.decode(row.detail),
        createdAt: row.created_at,
      });
    }
    const counts = await db.ghostSeatRuleSkip.groupBy({
      by: ['runId'],
      where: { runId: { in: [...runIds] } },
      _count: { _all: true },
    });
    for (const count of counts) {
      const entry = result.get(count.runId);
      if (entry) entry.total = count._count._all;
    }

    return result;
  }

  async find(runId: string, organizationId: string, tx?: DbTx): Promise<RuleRunRecord | null> {
    const row = await (tx ?? this.prisma).ghostSeatRuleRun.findFirst({ where: { id: runId, organizationId } });

    return row ? toRun(row) : null;
  }
}
