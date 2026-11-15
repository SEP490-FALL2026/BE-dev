import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { Grouping, SourceKind, UsagePeriod, UsageRange } from './usage-overview.types';

export interface SeriesFilter {
  range: UsageRange;
  periods: readonly UsagePeriod[];
  grouping: Grouping;
  /** The people read, each with the department they are read under. */
  people: ReadonlyArray<{ employeeId: string; departmentId: string }>;
  /** Who held the machines of the collectors, among these people. */
  holders: ReadonlyArray<{
    registrationId: string;
    employeeId: string;
    validFrom: BusinessDate;
    validUntil: BusinessDate | null;
  }>;
  /** The software each department's people hold a seat of in the range: where there may be nothing to read yet. */
  entitled: ReadonlyArray<{ departmentId: string; applicationId: string }>;
  applicationId?: string | undefined;
  sourceKind?: SourceKind | undefined;
  sourceId?: string | undefined;
  skip: number;
  take: number;
}

export interface SeriesRow {
  periodStart: BusinessDate;
  periodEnd: BusinessDate;
  periodDays: number;
  departmentId: string | null;
  applicationId: string | null;
  sourceId: string | null;
  tool: string | null;
  sourceName: string | null;
  activeDays: number;
  coveredDays: number;
  updatedAt: Date | null;
}

interface RawRow {
  period_start: string;
  period_end: string;
  period_days: number;
  g_dept: string | null;
  g_app: string | null;
  g_source: string | null;
  g_tool: string | null;
  g_name: string | null;
  active_days: number;
  covered_days: number;
  updated_at: Date | null;
  total: bigint;
}

/** The columns every fact is read under for one way of grouping the series: the others are null, so two facts of one group agree on all four. */
const GROUP_COLUMNS: Record<Grouping, Prisma.Sql> = {
  APPLICATION: Prisma.sql`application_id AS g_app, NULL::uuid AS g_source, NULL::text AS g_tool, NULL::uuid AS g_dept`,
  DEPARTMENT: Prisma.sql`NULL::uuid AS g_app, NULL::uuid AS g_source, NULL::text AS g_tool, department_id AS g_dept`,
  SOURCE: Prisma.sql`application_id AS g_app, source_id AS g_source, tool AS g_tool, NULL::uuid AS g_dept`,
};

const NO_NAME = Prisma.sql`NULL::text AS g_name`;

/** The last day of a registration still open: a date, as the database reads one, that no usage reaches. */
const OPEN_END = '9999-12-31';

/** Which groups exist for a way of grouping, before any day is counted: a group with nothing to read is still a group with no data. */
function groupsOf(grouping: Grouping, vendorOn: Prisma.Sql, sourceCondition: Prisma.Sql): Prisma.Sql {
  if (grouping === 'APPLICATION') {
    return Prisma.sql`SELECT DISTINCT application_id AS g_app, NULL::uuid AS g_source, NULL::text AS g_tool, NULL::uuid AS g_dept, ${NO_NAME} FROM pairs`;
  }
  if (grouping === 'DEPARTMENT') {
    return Prisma.sql`SELECT DISTINCT NULL::uuid AS g_app, NULL::uuid AS g_source, NULL::text AS g_tool, department_id AS g_dept, ${NO_NAME} FROM pairs`;
  }

  return Prisma.sql`
    SELECT s.application_id AS g_app, s.id AS g_source, NULL::text AS g_tool, NULL::uuid AS g_dept, s.name AS g_name
      FROM usage_sources s WHERE ${vendorOn} AND s.application_id IN (SELECT application_id FROM pairs) ${sourceCondition}
    UNION
    SELECT DISTINCT application_id, NULL::uuid, tool, NULL::uuid, tool FROM c_cov`;
}

/**
 * The facts of the days: when each person in the scope was active in each software, as the reports of a source say it (through the mapping in force now,
 * `DA6-11`) and as the collectors sent it (through who held the machine). Activity is a day on which the person did something (a login alone is
 * not); a day is covered when a report of a source or a collector observation says what happened on it.
 */
function factsOf(filter: SeriesFilter, flags: { vendorOn: Prisma.Sql; collectorOn: Prisma.Sql }): Prisma.Sql {
  const { range } = filter;
  const sourceCondition = (column: string): Prisma.Sql =>
    filter.sourceId ? Prisma.sql`AND ${Prisma.raw(column)} = ${filter.sourceId}::uuid` : Prisma.empty;
  const applicationCondition = (column: string): Prisma.Sql =>
    filter.applicationId ? Prisma.sql`AND ${Prisma.raw(column)} = ${filter.applicationId}::uuid` : Prisma.empty;

  return Prisma.sql`
    v_active AS (
      SELECT e.department_id, d.application_id, d.source_id, NULL::text AS tool, d.activity_date AS day
        FROM emp e
        JOIN usage_identity_mappings m ON m.employee_id = e.employee_id AND m.ended_at IS NULL
        JOIN usage_activity_days d ON d.organization_id = m.organization_id AND d.application_id = m.application_id
         AND d.identifier_type = m.identifier_type AND d.normalized_identifier = m.normalized_identifier
       WHERE ${flags.vendorOn} AND d.activity_date BETWEEN ${range.from}::date AND ${range.effectiveTo}::date
         AND d.superseded_by_import_id IS NULL AND d.event_class IN ('VALUE', 'PASSIVE')
         ${sourceCondition('d.source_id')} ${applicationCondition('d.application_id')}),
    c_obs AS (
      SELECT e.department_id, u.application_id, NULL::uuid AS source_id, u.tool::text AS tool, u.usage_date AS day, u.responses, u.received_at AS updated_at
        FROM holders h
        JOIN emp e ON e.employee_id = h.employee_id
        JOIN ai_usage_days u ON u.registration_id = h.registration_id
         AND u.usage_date BETWEEN h.valid_from AND h.valid_until
       WHERE ${flags.collectorOn} AND u.usage_date BETWEEN ${range.from}::date AND ${range.effectiveTo}::date
         AND u.coverage IN ('COVERED', 'PARTIAL') ${applicationCondition('u.application_id')}),
    pairs AS (
      SELECT department_id, application_id FROM entitled
      UNION SELECT department_id, application_id FROM v_active
      UNION SELECT department_id, application_id FROM c_obs WHERE responses > 0),
    v_cov AS (
      SELECT p.department_id, s.application_id, s.id AS source_id, NULL::text AS tool,
             greatest(i.coverage_from, ${range.from}::date) + g.n AS day, i.confirmed_at AS updated_at
        FROM pairs p
        JOIN usage_sources s ON s.application_id = p.application_id
        JOIN usage_imports i ON i.source_id = s.id AND i.status = 'COMPLETED'
        CROSS JOIN LATERAL generate_series(0, least(i.coverage_to, ${range.effectiveTo}::date) - greatest(i.coverage_from, ${range.from}::date)) AS g(n)
       WHERE ${flags.vendorOn} ${sourceCondition('s.id')}),
    c_cov AS (
      SELECT o.department_id, o.application_id, o.source_id, o.tool, o.day, o.updated_at
        FROM c_obs o JOIN pairs p ON p.department_id = o.department_id AND p.application_id = o.application_id),
    active AS (
      SELECT department_id, application_id, source_id, tool, day FROM v_active
      UNION ALL SELECT department_id, application_id, source_id, tool, day FROM c_obs WHERE responses > 0),
    covered AS (
      SELECT department_id, application_id, source_id, tool, day, updated_at FROM v_cov
      UNION ALL SELECT department_id, application_id, source_id, tool, day, updated_at FROM c_cov)`;
}

const SAME_GROUP = (left: string, right: string): Prisma.Sql =>
  Prisma.raw(
    ['g_app', 'g_source', 'g_tool', 'g_dept']
      .map((column) => `${left}.${column} IS NOT DISTINCT FROM ${right}.${column}`)
      .join(' AND '),
  );

/** The statement of one page of the series: the days are counted in the database, in one statement, whatever the number of days or groups. */
function seriesSql(filter: SeriesFilter): Prisma.Sql {
  const vendorOn = Prisma.raw(filter.sourceKind === 'COLLECTOR' ? 'false' : 'true');
  const collectorOn = Prisma.raw(filter.sourceKind === 'VENDOR' || filter.sourceId ? 'false' : 'true');
  const sourceCondition = filter.sourceId ? Prisma.sql`AND s.id = ${filter.sourceId}::uuid` : Prisma.empty;
  const columns = GROUP_COLUMNS[filter.grouping];

  return Prisma.sql`
    WITH
    periods AS (
      SELECT start_day::date AS start_day, end_day::date AS end_day, days FROM unnest(${filter.periods.map((p) => p.start)}::text[], ${filter.periods.map((p) => p.end)}::text[], ${filter.periods.map((p) => p.days)}::int[]) AS t(start_day, end_day, days)),
    emp AS (
      SELECT employee_id, department_id FROM unnest(${filter.people.map((p) => p.employeeId)}::uuid[], ${filter.people.map((p) => p.departmentId)}::uuid[]) AS t(employee_id, department_id)),
    holders AS (
      SELECT registration_id, employee_id, valid_from::date AS valid_from, valid_until::date AS valid_until
        FROM unnest(${filter.holders.map((h) => h.registrationId)}::uuid[], ${filter.holders.map((h) => h.employeeId)}::uuid[], ${filter.holders.map((h) => h.validFrom)}::text[], ${filter.holders.map((h) => h.validUntil ?? OPEN_END)}::text[]) AS t(registration_id, employee_id, valid_from, valid_until)),
    entitled AS (
      SELECT department_id, application_id FROM unnest(${filter.entitled.map((e) => e.departmentId)}::uuid[], ${filter.entitled.map((e) => e.applicationId)}::uuid[]) AS t(department_id, application_id)),
    ${factsOf(filter, { vendorOn, collectorOn })},
    act AS (SELECT ${columns}, day FROM active),
    cov AS (SELECT ${columns}, day, updated_at FROM covered),
    grp AS (${groupsOf(filter.grouping, vendorOn, sourceCondition)}),
    active_in AS (
      SELECT p.start_day, a.g_app, a.g_source, a.g_tool, a.g_dept, count(DISTINCT a.day)::int AS n
        FROM periods p JOIN act a ON a.day BETWEEN p.start_day AND p.end_day GROUP BY 1, 2, 3, 4, 5),
    covered_in AS (
      SELECT p.start_day, c.g_app, c.g_source, c.g_tool, c.g_dept, count(DISTINCT c.day)::int AS n, max(c.updated_at) AS updated_at
        FROM periods p JOIN cov c ON c.day BETWEEN p.start_day AND p.end_day GROUP BY 1, 2, 3, 4, 5),
    cells AS (
      SELECT p.start_day, p.end_day, p.days, g.g_app, g.g_source, g.g_tool, g.g_dept, g.g_name,
             coalesce(a.n, 0) AS active_days, coalesce(c.n, 0) AS covered_days, c.updated_at
        FROM periods p
        CROSS JOIN grp g
        LEFT JOIN active_in a ON a.start_day = p.start_day AND ${SAME_GROUP('a', 'g')}
        LEFT JOIN covered_in c ON c.start_day = p.start_day AND ${SAME_GROUP('c', 'g')})
    SELECT to_char(start_day, 'YYYY-MM-DD') AS period_start, to_char(end_day, 'YYYY-MM-DD') AS period_end, days AS period_days,
           g_dept, g_app, g_source, g_tool, g_name, active_days, covered_days, updated_at, count(*) OVER() AS total
      FROM cells
     ORDER BY start_day, g_dept NULLS FIRST, g_app NULLS FIRST, g_source NULLS FIRST, g_tool NULLS FIRST
     LIMIT ${filter.take} OFFSET ${filter.skip}`;
}

/** What the series of usage reads: the days people were active and the days something told, counted in the database. Reads only. */
@Injectable()
export class UsageOverviewRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the series: a row for each period and group, with the days the group was active and the days anything covered, each day
   * counted once however many sources told of it (a union of days, never a sum), and the instant of the latest data. Newest data last in
   * the order: period first, then the group by its ids, so the pages never overlap.
   */
  async page(filter: SeriesFilter): Promise<{ rows: SeriesRow[]; total: number }> {
    const raw = await this.prisma.$queryRaw<RawRow[]>(seriesSql(filter));

    return {
      total: Number(raw[0]?.total ?? 0n),
      rows: raw.map((row) => ({
        periodStart: row.period_start,
        periodEnd: row.period_end,
        periodDays: row.period_days,
        departmentId: row.g_dept,
        applicationId: row.g_app,
        sourceId: row.g_source,
        tool: row.g_tool,
        sourceName: row.g_name,
        activeDays: row.active_days,
        coveredDays: row.covered_days,
        updatedAt: row.updated_at,
      })),
    };
  }

  /** The registrations a collector sent a day for in the range (one for each machine and holder): who held them is asked of the devices. */
  async collectorRegistrations(range: UsageRange): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ registration_id: string }>>`
      SELECT DISTINCT registration_id::text AS registration_id FROM ai_usage_days
       WHERE usage_date BETWEEN ${range.from}::date AND ${range.effectiveTo}::date`;

    return rows.map((row) => row.registration_id);
  }
}
