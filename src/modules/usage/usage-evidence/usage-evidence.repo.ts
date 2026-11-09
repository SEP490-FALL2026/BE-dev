import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { EvidenceMatchMethod } from '../public/usage-evidence.types';

export interface VendorSourceFacts {
  id: string;
  name: string;
  activityDefinition: string;
  strictness: 'STRICT' | 'LOOSE';
  direction: 'POSITIVE_ONLY' | 'POSITIVE_AND_NEGATIVE';
  capMemberList: boolean;
  capLastActivity: boolean;
  capEventDetail: boolean;
  coverageFrom: BusinessDate;
  coverageTo: BusinessDate;
}

export interface VendorDay {
  sourceId: string;
  employeeId: string;
  date: BusinessDate;
  eventClass: 'VALUE' | 'PASSIVE' | 'AUTH_ONLY';
  method: EvidenceMatchMethod;
}

export interface CollectorDay {
  registrationId: string;
  date: BusinessDate;
  active: boolean;
}

/**
 * What the evidence of the usage of an application reads: the days vendors reported tied to people through the mappings in force at the moment
 * of reading, and the days the collectors sent. Reads only; a fixed number of statements however many days there are. The volume of use is never read.
 */
@Injectable()
export class UsageEvidenceRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The sources of the application with at least one confirmed report, with the days all their reports cover together. */
  async vendorSources(applicationId: string, tx?: DbTx): Promise<VendorSourceFacts[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<
      Array<{
        id: string;
        name: string;
        activity_definition: string;
        definition_strictness: 'STRICT' | 'LOOSE';
        evidence_direction: 'POSITIVE_ONLY' | 'POSITIVE_AND_NEGATIVE';
        cap_member_list: boolean;
        cap_last_activity: boolean;
        cap_event_detail: boolean;
        coverage_from: string;
        coverage_to: string;
      }>
    >`
      SELECT s.id, s.name, s.activity_definition, s.definition_strictness::text AS definition_strictness,
             s.evidence_direction::text AS evidence_direction, s.cap_member_list, s.cap_last_activity, s.cap_event_detail,
             to_char(min(i.coverage_from), 'YYYY-MM-DD') AS coverage_from, to_char(max(i.coverage_to), 'YYYY-MM-DD') AS coverage_to
        FROM usage_sources s
        JOIN usage_imports i ON i.source_id = s.id AND i.status = 'COMPLETED'
       WHERE s.application_id = ${applicationId}::uuid
       GROUP BY s.id
       ORDER BY s.created_at, s.id`;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      activityDefinition: row.activity_definition,
      strictness: row.definition_strictness,
      direction: row.evidence_direction,
      capMemberList: row.cap_member_list,
      capLastActivity: row.cap_last_activity,
      capEventDetail: row.cap_event_detail,
      coverageFrom: row.coverage_from,
      coverageTo: row.coverage_to,
    }));
  }

  /**
   * The days of these people on or before `asOf` that no later report took over, each tied to the person through the mapping in force now
   * (an identifier with no mapping, or whose mapping ended, belongs to nobody: `INV-12`, `DA6-11`).
   */
  async vendorDays(
    applicationId: string,
    employeeIds: readonly string[],
    asOf: BusinessDate,
    tx?: DbTx,
  ): Promise<VendorDay[]> {
    if (employeeIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).$queryRaw<
      Array<{
        source_id: string;
        employee_id: string;
        activity_date: string;
        event_class: VendorDay['eventClass'];
        method: EvidenceMatchMethod;
      }>
    >`
      SELECT d.source_id, m.employee_id, to_char(d.activity_date, 'YYYY-MM-DD') AS activity_date, d.event_class::text AS event_class,
             m.method::text AS method
        FROM usage_activity_days d
        JOIN usage_identity_mappings m
          ON m.organization_id = d.organization_id AND m.application_id = d.application_id AND m.identifier_type = d.identifier_type
         AND m.normalized_identifier = d.normalized_identifier AND m.ended_at IS NULL
       WHERE d.application_id = ${applicationId}::uuid AND m.employee_id = ANY(${[...employeeIds]}::uuid[])
         AND d.superseded_by_import_id IS NULL AND d.activity_date <= ${asOf}::date`;

    return rows.map((row) => ({
      sourceId: row.source_id,
      employeeId: row.employee_id,
      date: row.activity_date,
      eventClass: row.event_class,
      method: row.method,
    }));
  }

  /** The last day a mapping of each of these people was tied or taken back after an earlier tie of the same identifier ended. */
  async mappingChanges(
    applicationId: string,
    employeeIds: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, BusinessDate>> {
    if (employeeIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).$queryRaw<Array<{ employee_id: string; changed_on: string }>>`
      SELECT employee_id, to_char(max(changed_on), 'YYYY-MM-DD') AS changed_on
        FROM (
          SELECT m.employee_id, m.ended_at::date AS changed_on
            FROM usage_identity_mappings m
           WHERE m.application_id = ${applicationId}::uuid AND m.employee_id = ANY(${[...employeeIds]}::uuid[]) AND m.ended_at IS NOT NULL
          UNION ALL
          SELECT m.employee_id, m.created_at::date
            FROM usage_identity_mappings m
           WHERE m.application_id = ${applicationId}::uuid AND m.employee_id = ANY(${[...employeeIds]}::uuid[]) AND m.ended_at IS NULL
             AND EXISTS (SELECT 1 FROM usage_identity_mappings o
                          WHERE o.application_id = m.application_id AND o.identifier_type = m.identifier_type
                            AND o.normalized_identifier = m.normalized_identifier AND o.ended_at IS NOT NULL)
        ) changes
       GROUP BY employee_id`;

    return new Map(rows.map((row) => [row.employee_id, row.changed_on]));
  }

  /** The identifiers of the application nobody is tied to (open or dismissed), each with the last day it was active and who it may be. */
  async unmatched(
    applicationId: string,
    tx?: DbTx,
  ): Promise<
    Array<{ status: 'OPEN' | 'DISMISSED'; lastActivityDate: BusinessDate | null; candidateEmployeeIds: string[] }>
  > {
    const rows = await (tx ?? this.prisma).$queryRaw<
      Array<{ status: 'OPEN' | 'DISMISSED'; last_date: string | null; candidate_employee_ids: string[] }>
    >`
      SELECT u.status::text AS status, u.candidate_employee_ids,
             (SELECT to_char(max(d.activity_date), 'YYYY-MM-DD') FROM usage_activity_days d
               WHERE d.application_id = u.application_id AND d.identifier_type = u.identifier_type
                 AND d.normalized_identifier = u.normalized_identifier AND d.superseded_by_import_id IS NULL
                 AND d.event_class IN ('VALUE', 'PASSIVE')) AS last_date
        FROM usage_unmatched_identities u
       WHERE u.application_id = ${applicationId}::uuid AND u.status IN ('OPEN', 'DISMISSED')
       ORDER BY u.id`;

    return rows.map((row) => ({
      status: row.status,
      lastActivityDate: row.last_date,
      candidateEmployeeIds: row.candidate_employee_ids,
    }));
  }

  /** The registrations that sent usage of the application (a few: one for each machine). */
  async collectorRegistrations(applicationId: string, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).aiUsageDay.findMany({
      where: { applicationId },
      select: { registrationId: true },
      distinct: ['registrationId'],
    });

    return rows.map((row) => row.registrationId);
  }

  /** The days of these registrations on or before `asOf` that a collector observed, and whether the tool answered on them. */
  async collectorDays(
    applicationId: string,
    registrationIds: readonly string[],
    asOf: BusinessDate,
    tx?: DbTx,
  ): Promise<CollectorDay[]> {
    if (registrationIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).$queryRaw<
      Array<{ registration_id: string; usage_date: string; responses: number }>
    >`
      SELECT registration_id, to_char(usage_date, 'YYYY-MM-DD') AS usage_date, responses
        FROM ai_usage_days
       WHERE application_id = ${applicationId}::uuid AND registration_id = ANY(${[...registrationIds]}::uuid[])
         AND coverage IN ('COVERED', 'PARTIAL') AND usage_date <= ${asOf}::date`;

    return rows.map((row) => ({
      registrationId: row.registration_id,
      date: row.usage_date,
      active: row.responses > 0,
    }));
  }

  /** The first and the last day a collector observed anything of the application up to `asOf`; null when none did. */
  async collectorCoverage(
    applicationId: string,
    asOf: BusinessDate,
    tx?: DbTx,
  ): Promise<{ from: BusinessDate; to: BusinessDate } | null> {
    const rows = await (tx ?? this.prisma).$queryRaw<Array<{ from_date: string | null; to_date: string | null }>>`
      SELECT to_char(min(usage_date), 'YYYY-MM-DD') AS from_date, to_char(max(usage_date), 'YYYY-MM-DD') AS to_date
        FROM ai_usage_days
       WHERE application_id = ${applicationId}::uuid AND coverage IN ('COVERED', 'PARTIAL') AND usage_date <= ${asOf}::date`;
    const row = rows[0];

    return row?.from_date && row.to_date ? { from: row.from_date, to: row.to_date } : null;
  }

  /** How many findings of activity with no seat are open. */
  countOpenFindings(tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).usageNoAssignmentFinding.count({ where: { status: 'OPEN' } });
  }
}
