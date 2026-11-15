import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { UsageRange } from './usage-overview.types';

/** A vendor source of the application, with how many days of the range the reports of its imports cover (a day once). */
export interface SourceCoverage {
  sourceId: string;
  name: string;
  coveredDays: number;
  updatedAt: Date | null;
}

/** One day a collector observed of a person's tool, the machines of that day together. */
export interface CollectorDayFacts {
  date: BusinessDate;
  tool: string;
  coverage: 'COVERED' | 'PARTIAL';
  active: boolean;
  responses: number;
  totalTokens: number;
  updatedAt: Date;
}

/**
 * What the detail of one person's usage of one application reads beyond the series: for each source of the application how many days of the range its
 * reports cover, the days the person was active in each, and what the collector saw of them each day. Reads only, a fixed number of statements.
 */
@Injectable()
export class UsageEmployeeRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The sources of the application, the newest first, at most `limit`, with the days of the range their completed reports cover. */
  async sourceCoverage(applicationId: string, range: UsageRange, limit: number): Promise<SourceCoverage[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ source_id: string; name: string; covered_days: number; updated_at: Date | null }>
    >`
      SELECT s.id AS source_id, s.name,
             count(DISTINCT greatest(i.coverage_from, ${range.from}::date) + g.n)::int AS covered_days, max(i.confirmed_at) AS updated_at
        FROM usage_sources s
        LEFT JOIN usage_imports i ON i.source_id = s.id AND i.status = 'COMPLETED'
         AND i.coverage_from <= ${range.effectiveTo}::date AND i.coverage_to >= ${range.from}::date
        LEFT JOIN LATERAL generate_series(0, least(i.coverage_to, ${range.effectiveTo}::date) - greatest(i.coverage_from, ${range.from}::date)) AS g(n) ON true
       WHERE s.application_id = ${applicationId}::uuid
       GROUP BY s.id, s.name, s.created_at
       ORDER BY s.created_at DESC, s.id
       LIMIT ${limit}`;

    return rows.map((row) => ({
      sourceId: row.source_id,
      name: row.name,
      coveredDays: row.covered_days,
      updatedAt: row.updated_at,
    }));
  }

  /** The days of the range the person was active in the application, for each source, through the mapping in force now (a login alone is not activity). */
  async vendorActiveDates(
    applicationId: string,
    employeeId: string,
    range: UsageRange,
  ): Promise<Array<{ sourceId: string; date: BusinessDate }>> {
    const rows = await this.prisma.$queryRaw<Array<{ source_id: string; day: string }>>`
      SELECT d.source_id, to_char(d.activity_date, 'YYYY-MM-DD') AS day
        FROM usage_identity_mappings m
        JOIN usage_activity_days d ON d.organization_id = m.organization_id AND d.application_id = m.application_id
         AND d.identifier_type = m.identifier_type AND d.normalized_identifier = m.normalized_identifier
       WHERE m.employee_id = ${employeeId}::uuid AND m.ended_at IS NULL AND m.application_id = ${applicationId}::uuid
         AND d.activity_date BETWEEN ${range.from}::date AND ${range.effectiveTo}::date
         AND d.superseded_by_import_id IS NULL AND d.event_class IN ('VALUE', 'PASSIVE')
       GROUP BY d.source_id, d.activity_date
       ORDER BY d.activity_date, d.source_id`;

    return rows.map((row) => ({ sourceId: row.source_id, date: row.day }));
  }

  /** The days the registrations of the person were observed on in the range, one row for each day (the machines of that day together; an application has one tool). */
  async collectorDays(
    applicationId: string,
    registrationIds: readonly string[],
    range: UsageRange,
  ): Promise<CollectorDayFacts[]> {
    if (registrationIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<
      Array<{
        day: string;
        tool: string;
        covered: boolean;
        responses: number;
        total_tokens: number;
        updated_at: Date;
      }>
    >`
      SELECT to_char(usage_date, 'YYYY-MM-DD') AS day, min(tool::text) AS tool, bool_or(coverage = 'COVERED') AS covered,
             sum(responses)::int AS responses, sum(total_tokens)::double precision AS total_tokens, max(received_at) AS updated_at
        FROM ai_usage_days
       WHERE application_id = ${applicationId}::uuid AND registration_id = ANY(${[...registrationIds]}::uuid[])
         AND usage_date BETWEEN ${range.from}::date AND ${range.effectiveTo}::date AND coverage IN ('COVERED', 'PARTIAL')
       GROUP BY usage_date
       ORDER BY usage_date`;

    return rows.map((row) => ({
      date: row.day,
      tool: row.tool,
      coverage: row.covered ? 'COVERED' : 'PARTIAL',
      active: row.responses > 0,
      responses: row.responses,
      totalTokens: row.total_tokens,
      updatedAt: row.updated_at,
    }));
  }
}
