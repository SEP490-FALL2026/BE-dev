import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { UsageEmployeeRepo, type CollectorDayFacts, type SourceCoverage } from './usage-employee.repo';
import {
  MAX_DETAIL_SOURCES,
  type CollectorDetail,
  type CountedRange,
  type EmployeeRef,
  type SoftwareDetail,
  type SoftwareLine,
  type SoftwareList,
  type VendorSourceDetail,
} from './usage-employee.types';
import { UsageOverviewRefusedError } from './usage-overview.errors';
import { dataStatusOf, resolveRange, wholeRangeOf } from './usage-overview.policy';
import { UsageOverviewRepo, type SeriesFilter, type SeriesRow } from './usage-overview.repo';
import { UsageOverviewPeopleService } from './usage-overview-people.service';
import { UsageOverviewScopeService, type ScopedEmployee } from './usage-overview-scope.service';
import type { ApplicationRef, UsagePeriod, UsageRange } from './usage-overview.types';

interface ViewQuery {
  from?: string | undefined;
  to?: string | undefined;
}

/** What is read to answer for one person: who they are, the range, the days counted (none while every day asked for is still to come). */
interface Reading {
  employee: ScopedEmployee;
  range: UsageRange;
  period: UsagePeriod | null;
}

const refName = (id: string, found: ReadonlyMap<string, ApplicationRef>): ApplicationRef =>
  found.get(id) ?? { id, name: id, logoUrl: null };

/**
 * What an IT Admin reads of one person's usage (`QĐ-111aw`, `QĐ-111ax`): the software they hold a seat of or used in a range, and, for one
 * software, what each source says of them separately. The person is shown by their code alone, never a name or a photo. A person outside the
 * departments of the IT Admin is not told apart from one who does not exist (D8). Nothing here sorts people or software by how much was
 * used; the counts of answers and of tokens are in the detail alone.
 */
@Injectable()
export class UsageEmployeeViewService {
  constructor(
    private readonly employees: UsageEmployeeRepo,
    private readonly series: UsageOverviewRepo,
    private readonly scope: UsageOverviewScopeService,
    private readonly ties: UsageOverviewPeopleService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
  ) {}

  /** Throws UsageOverviewRefusedError (`RANGE_INVALID`, `EMPLOYEE_NOT_FOUND`). */
  async software(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    query: ViewQuery & { page: number; pageSize: number },
  ): Promise<SoftwareList> {
    const reading = await this.reading(actor, employeeId, query);
    const employee = refOf(reading.employee);
    const range = countedOf(reading);
    if (!reading.period) return { employee, range, items: [], total: 0 };
    const people = [personOf(reading.employee)];
    const entitled = await this.ties.entitledOf(people, reading.range);
    const { rows, total } = await this.series.page({
      ...this.filterOf(reading, reading.period, people),
      holders: await this.ties.holdersAmong(people, reading.range),
      entitled,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const seats = new Set(entitled.map((pair) => pair.applicationId));
    const names = await this.namesOf(rows);

    return {
      employee,
      range,
      items: rows.flatMap((row) => (row.applicationId ? [lineOf(row, refName(row.applicationId, names), seats)] : [])),
      total,
    };
  }

  /** Throws UsageOverviewRefusedError (`RANGE_INVALID`, `EMPLOYEE_NOT_FOUND`, `APPLICATION_NOT_FOUND`). */
  async detail(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    applicationId: string,
    query: ViewQuery,
  ): Promise<SoftwareDetail> {
    const reading = await this.reading(actor, employeeId, query);
    const names = await this.namesOf([{ applicationId }]);
    if (!names.has(applicationId)) throw new UsageOverviewRefusedError('APPLICATION_NOT_FOUND');
    const base = {
      employee: refOf(reading.employee),
      application: refName(applicationId, names),
      range: countedOf(reading),
    };
    if (!reading.period) {
      return {
        ...base,
        hasSeat: false,
        status: 'NO_DATA',
        activeDays: 0,
        coveredDays: 0,
        updatedAt: null,
        vendorSources: [],
        sourcesTruncated: false,
        collector: null,
      };
    }
    const people = [personOf(reading.employee)];
    const entitled = await this.ties.entitledOf(people, reading.range, applicationId);
    const holders = await this.ties.holdersAmong(people, reading.range, applicationId);
    const { rows } = await this.series.page({
      ...this.filterOf(reading, reading.period, people),
      applicationId,
      holders,
      entitled,
      skip: 0,
      take: 1,
    });
    const overall = rows[0];
    const sources = await this.sourcesOf(applicationId, reading, reading.period);
    const collector = await this.collectorOf(applicationId, holders, reading, reading.period);

    return {
      ...base,
      hasSeat: entitled.length > 0,
      status: dataStatusOf(overall?.coveredDays ?? 0, reading.period.days),
      activeDays: overall?.activeDays ?? 0,
      coveredDays: overall?.coveredDays ?? 0,
      updatedAt: overall?.updatedAt ?? null,
      ...sources,
      collector,
    };
  }

  private async reading(actor: AuthenticatedPrincipal, employeeId: string, query: ViewQuery): Promise<Reading> {
    const today = await this.organizationReads.businessToday();
    const resolved = resolveRange({ today, from: query.from, to: query.to });
    if (!resolved.ok) throw new UsageOverviewRefusedError('RANGE_INVALID', resolved.problem);
    const employee = await this.scope.employeeInScope(actor, employeeId, today);
    if (!employee) throw new UsageOverviewRefusedError('EMPLOYEE_NOT_FOUND');

    return { employee, range: resolved.range, period: wholeRangeOf(resolved.range) };
  }

  private filterOf(
    reading: Reading,
    period: UsagePeriod,
    people: SeriesFilter['people'],
  ): Omit<SeriesFilter, 'holders' | 'entitled' | 'skip' | 'take'> {
    return { range: reading.range, periods: [period], grouping: 'APPLICATION', people };
  }

  /** The applications of the rows, by id, with their name and logo, in one read. */
  private async namesOf(rows: ReadonlyArray<{ applicationId: string | null }>): Promise<Map<string, ApplicationRef>> {
    const ids = [...new Set(rows.flatMap((row) => (row.applicationId ? [row.applicationId] : [])))];
    const found = ids.length > 0 ? await this.catalog.getCollectorApplications(ids) : [];

    return new Map(
      found.map((app): [string, ApplicationRef] => [app.id, { id: app.id, name: app.name, logoUrl: app.logoUrl }]),
    );
  }

  /** What each vendor source says of the person: the days they were active in it, and how many days of the range its reports cover. */
  private async sourcesOf(
    applicationId: string,
    reading: Reading,
    period: UsagePeriod,
  ): Promise<{ vendorSources: VendorSourceDetail[]; sourcesTruncated: boolean }> {
    const read = await this.employees.sourceCoverage(applicationId, reading.range, MAX_DETAIL_SOURCES + 1);
    const shown = read.slice(0, MAX_DETAIL_SOURCES);
    const active = await this.employees.vendorActiveDates(applicationId, reading.employee.employeeId, reading.range);

    return {
      vendorSources: shown.map((source) => sourceDetailOf(source, active, period)),
      sourcesTruncated: read.length > MAX_DETAIL_SOURCES,
    };
  }

  /** What the collector saw of the tool of the person, day by day; null when no machine of theirs sent a day of the application in the range. */
  private async collectorOf(
    applicationId: string,
    holders: SeriesFilter['holders'],
    reading: Reading,
    period: UsagePeriod,
  ): Promise<CollectorDetail | null> {
    const days = await this.employees.collectorDays(
      applicationId,
      [...new Set(holders.map((h) => h.registrationId))],
      reading.range,
    );

    return days.length === 0 ? null : collectorDetailOf(days, period);
  }
}

const personOf = (employee: ScopedEmployee) => ({
  employeeId: employee.employeeId,
  departmentId: employee.departmentId,
});
const refOf = (employee: ScopedEmployee): EmployeeRef => ({
  id: employee.employeeId,
  employeeCode: employee.employeeCode,
});
const countedOf = (reading: Reading): CountedRange => ({
  from: reading.range.from,
  to: reading.range.to,
  days: reading.period?.days ?? 0,
});

function lineOf(row: SeriesRow, application: ApplicationRef, seats: ReadonlySet<string>): SoftwareLine {
  return {
    application,
    hasSeat: seats.has(application.id),
    status: dataStatusOf(row.coveredDays, row.periodDays),
    activeDays: row.activeDays,
    coveredDays: row.coveredDays,
    updatedAt: row.updatedAt,
  };
}

function sourceDetailOf(
  source: SourceCoverage,
  active: ReadonlyArray<{ sourceId: string; date: string }>,
  period: UsagePeriod,
): VendorSourceDetail {
  const activeDates = active.filter((day) => day.sourceId === source.sourceId).map((day) => day.date);

  return {
    sourceId: source.sourceId,
    name: source.name,
    status: dataStatusOf(source.coveredDays, period.days),
    activeDays: activeDates.length,
    coveredDays: source.coveredDays,
    activeDates,
    updatedAt: source.updatedAt,
  };
}

function collectorDetailOf(days: readonly CollectorDayFacts[], period: UsagePeriod): CollectorDetail {
  return {
    tool: days[0].tool,
    status: dataStatusOf(days.length, period.days),
    activeDays: days.filter((day) => day.active).length,
    coveredDays: days.length,
    updatedAt: days.reduce<Date | null>(
      (latest, day) => (latest && latest > day.updatedAt ? latest : day.updatedAt),
      null,
    ),
    days: days.map((day) => ({
      date: day.date,
      coverage: day.coverage,
      active: day.active,
      responses: day.responses,
      totalTokens: day.totalTokens,
    })),
  };
}
