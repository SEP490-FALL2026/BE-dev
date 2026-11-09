import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AiToolKey } from '../allowlist/allowlist.policy';
import type { AcceptedUsageRow } from './ai-usage-day.policy';

export interface UpsertContext {
  organizationId: string;
  deviceId: string;
  registrationId: string;
  credentialId: string;
  generatedAt: Date;
}

export interface UsageDayRow {
  usageDate: Date;
  tool: AiToolKey;
  coverage: 'COVERED' | 'PARTIAL' | 'NOT_OBSERVABLE';
  responses: number;
  totalTokens: number;
  generatedAt: Date;
  registrationId: string;
}

export interface UsageFilter {
  deviceId: string;
  /** Only these registrations (the machines a person held); every registration of the machine when absent. */
  registrationIds?: readonly string[] | undefined;
  from?: BusinessDate | undefined;
  to?: BusinessDate | undefined;
}

function whereOf(filter: UsageFilter): Prisma.Sql {
  const conditions = [Prisma.sql`device_id = ${filter.deviceId}::uuid`];
  if (filter.registrationIds)
    conditions.push(Prisma.sql`registration_id = ANY(${[...filter.registrationIds]}::uuid[])`);
  if (filter.from) conditions.push(Prisma.sql`usage_date >= ${filter.from}::date`);
  if (filter.to) conditions.push(Prisma.sql`usage_date <= ${filter.to}::date`);

  return Prisma.join(conditions, ' AND ');
}

/** The usage of AI tools, one row for each (registration, tool, day). */
@Injectable()
export class AiUsageRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes the accepted days in one statement: a row is made, or replaced only by a build with different counts that was made at the same
   * instant or later, so a late-arriving older build, a build sent twice, and the same counts sent again by a later build (the tool sends
   * its whole window each week) all answer UNCHANGED; the last of them moves only the instant the counts were last confirmed. Rows are taken in a fixed order so two batches
   * of one machine never wait on each other in a circle. Returns the (tool, day) pairs that changed.
   */
  async upsertDays(
    tx: DbTx,
    context: UpsertContext,
    rows: readonly (AcceptedUsageRow & { date: BusinessDate })[],
  ): Promise<Set<string>> {
    if (rows.length === 0) return new Set();
    const ordered = [...rows].sort((a, b) =>
      a.tool === b.tool ? a.date.localeCompare(b.date) : a.tool.localeCompare(b.tool),
    );
    const changed = await tx.$queryRaw<{ tool: string; usage_date: Date }[]>`
      INSERT INTO ai_usage_days (id, organization_id, device_id, registration_id, credential_id, tool, application_id, usage_date,
                                 coverage, responses, total_tokens, generated_at, content_hash)
      SELECT gen_random_uuid(), ${context.organizationId}::uuid, ${context.deviceId}::uuid, ${context.registrationId}::uuid,
             ${context.credentialId}::uuid, v.tool::"AiToolKey", v.application_id::uuid, v.usage_date::date,
             v.coverage::"UsageCoverage", v.responses, v.total_tokens::bigint, ${context.generatedAt}, v.content_hash
        FROM unnest(
          ${ordered.map((row) => row.tool)}::text[], ${ordered.map((row) => row.applicationId)}::text[],
          ${ordered.map((row) => row.date)}::text[], ${ordered.map((row) => row.coverage)}::text[],
          ${ordered.map((row) => row.responses)}::int[], ${ordered.map((row) => String(row.totalTokens))}::text[],
          ${ordered.map((row) => row.contentHash)}::text[]
        ) AS v(tool, application_id, usage_date, coverage, responses, total_tokens, content_hash)
      ON CONFLICT (registration_id, tool, usage_date) DO UPDATE SET
        credential_id = EXCLUDED.credential_id, application_id = EXCLUDED.application_id, coverage = EXCLUDED.coverage,
        responses = EXCLUDED.responses, total_tokens = EXCLUDED.total_tokens, generated_at = EXCLUDED.generated_at,
        content_hash = EXCLUDED.content_hash, received_at = now()
      WHERE ai_usage_days.content_hash <> EXCLUDED.content_hash AND ai_usage_days.generated_at <= EXCLUDED.generated_at
      RETURNING tool, usage_date`;

    // The same counts in a later build change nothing but the instant the counts were last confirmed: a different count from a build
    // in between, arriving late, must not win over a build that saw the same counts after it.
    await tx.$executeRaw`
      UPDATE ai_usage_days d SET generated_at = ${context.generatedAt}
        FROM unnest(
          ${ordered.map((row) => row.tool)}::text[], ${ordered.map((row) => row.date)}::text[],
          ${ordered.map((row) => row.contentHash)}::text[]
        ) AS v(tool, usage_date, content_hash)
       WHERE d.registration_id = ${context.registrationId}::uuid AND d.tool = v.tool::"AiToolKey" AND d.usage_date = v.usage_date::date
         AND d.content_hash = v.content_hash AND d.generated_at < ${context.generatedAt}`;

    return new Set(changed.map((row) => `${row.tool}|${row.usage_date.toISOString().slice(0, 10)}`));
  }

  /** A page of the days counted on a machine, newest day first, with the total of the same snapshot. */
  async page(filter: UsageFilter, skip: number, take: number): Promise<{ rows: UsageDayRow[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<UsageDayRow[]>`
          SELECT usage_date AS "usageDate", tool, coverage, responses, total_tokens::double precision AS "totalTokens",
                 generated_at AS "generatedAt", registration_id AS "registrationId"
            FROM ai_usage_days WHERE ${whereOf(filter)}
           ORDER BY usage_date DESC, tool, id LIMIT ${take} OFFSET ${skip}`;
        const counted = await tx.$queryRaw<
          { total: bigint }[]
        >`SELECT count(*) AS total FROM ai_usage_days WHERE ${whereOf(filter)}`;

        return { rows, total: Number(counted[0]?.total ?? 0n) };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
