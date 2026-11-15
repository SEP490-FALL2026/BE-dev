import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { DevicesApi } from '../../devices/public/devices.api';
import { LicensingUsageApi } from '../../licensing/public/licensing-usage.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { UsageOverviewRefusedError } from './usage-overview.errors';
import { dataStatusOf, periodsOf, resolveRange } from './usage-overview.policy';
import { UsageOverviewRepo, type SeriesRow } from './usage-overview.repo';
import { UsageOverviewScopeService, type ScopedPerson } from './usage-overview-scope.service';
import type { ApplicationRef, SourceKind, UsageOverviewQuery, UsagePoint, UsageRange } from './usage-overview.types';

/**
 * The series of the usage an IT Admin reads (`QĐ-111aw`): for each period and department, application or source, the days people were
 * active and the days anything covered, a day once however many sources told of it. Only the people of the scope are read (`QĐ-111ax`, D8): a
 * filter outside it gives an empty page. No name, no volume, no rank comes out of it.
 */
@Injectable()
export class UsageOverviewQueryService {
  constructor(
    private readonly repo: UsageOverviewRepo,
    private readonly scope: UsageOverviewScopeService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly devices: DevicesApi,
    private readonly licensing: LicensingUsageApi,
  ) {}

  /** Throws UsageOverviewRefusedError (`RANGE_INVALID`). */
  async series(actor: AuthenticatedPrincipal, query: UsageOverviewQuery): Promise<Page<UsagePoint>> {
    const today = await this.organizationReads.businessToday();
    const resolved = resolveRange({ today, from: query.from, to: query.to });
    if (!resolved.ok) throw new UsageOverviewRefusedError('RANGE_INVALID', resolved.problem);
    const { range } = resolved;
    const periods = periodsOf(range, query.granularity);
    const nothing = pageOf<UsagePoint>([], 0, query.page, query.pageSize);
    if (periods.length === 0) return nothing;
    const people = await this.scope.peopleOf(actor, query, today);
    if (people.length === 0) return nothing;

    const { rows, total } = await this.repo.page({
      range,
      periods,
      grouping: query.groupBy,
      people,
      holders: await this.holdersAmong(people, range),
      entitled: await this.entitledOf(people, range, query.applicationId),
      applicationId: query.applicationId,
      sourceKind: query.sourceKind,
      sourceId: query.sourceId,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.pointsOf(rows), total, query.page, query.pageSize);
  }

  /** Who held each machine a collector sent days for, among the people read (one read of the devices for all of them). */
  private async holdersAmong(people: readonly ScopedPerson[], range: UsageRange) {
    const read = new Set(people.map((person) => person.employeeId));
    const holders = await this.devices.registrationHolders(await this.repo.collectorRegistrations(range));

    return holders
      .filter((holder) => read.has(holder.employeeId))
      .map((holder) => ({
        registrationId: holder.registrationId,
        employeeId: holder.employeeId,
        validFrom: fromDateColumn(holder.validFrom),
        validUntil: holder.validUntil ? fromDateColumn(holder.validUntil) : null,
      }));
  }

  /** The software each department's people hold a seat of that can be used in the range: where there may be nothing to read yet. */
  private async entitledOf(people: readonly ScopedPerson[], range: UsageRange, applicationId: string | undefined) {
    const departmentOf = new Map(people.map((person) => [person.employeeId, person.departmentId]));
    const intervals = await this.licensing.listAssignmentIntervals({
      employeeIds: [...departmentOf.keys()],
      from: range.from,
      to: range.effectiveTo,
      ...(applicationId ? { applicationId } : {}),
    });
    const pairs = new Map<string, { departmentId: string; applicationId: string }>();
    for (const interval of intervals) {
      const departmentId = departmentOf.get(interval.employeeId);
      if (!departmentId || interval.usableOn === null || interval.usableOn > range.effectiveTo) continue;
      pairs.set(`${departmentId}|${interval.applicationId}`, { departmentId, applicationId: interval.applicationId });
    }

    return [...pairs.values()];
  }

  /** The rows as points: the names of the departments and applications of the whole page come in one read each. */
  private async pointsOf(rows: readonly SeriesRow[]): Promise<UsagePoint[]> {
    const departmentIds = [...new Set(rows.flatMap((row) => (row.departmentId ? [row.departmentId] : [])))];
    const applicationIds = [...new Set(rows.flatMap((row) => (row.applicationId ? [row.applicationId] : [])))];
    const departments = new Map(
      (departmentIds.length > 0 ? await this.organizationReads.getDepartmentBriefs(departmentIds) : []).map(
        (department) => [department.id, department],
      ),
    );
    const applications = new Map(
      (applicationIds.length > 0 ? await this.catalog.getCollectorApplications(applicationIds) : []).map(
        (application): [string, ApplicationRef] => [
          application.id,
          { id: application.id, name: application.name, logoUrl: application.logoUrl },
        ],
      ),
    );
    const applicationOf = (id: string): ApplicationRef => applications.get(id) ?? { id, name: id, logoUrl: null };

    return rows.map((row) => toPoint(row, departments, applicationOf));
  }
}

function toPoint(
  row: SeriesRow,
  departments: ReadonlyMap<string, { id: string; code: string; name: string }>,
  applicationOf: (id: string) => ApplicationRef,
): UsagePoint {
  const department = row.departmentId ? departments.get(row.departmentId) : undefined;
  const kind: SourceKind = row.sourceId ? 'VENDOR' : 'COLLECTOR';
  const isSource = row.applicationId !== null && (row.sourceId !== null || row.tool !== null);

  return {
    period: { start: row.periodStart, end: row.periodEnd, days: row.periodDays },
    department: department ? { id: department.id, code: department.code, name: department.name } : null,
    application: row.applicationId && !isSource ? applicationOf(row.applicationId) : null,
    source:
      row.applicationId && isSource
        ? {
            kind,
            id: row.sourceId,
            name: row.sourceName ?? row.tool ?? '',
            application: applicationOf(row.applicationId),
          }
        : null,
    activeDays: row.activeDays,
    coveredDays: row.coveredDays,
    status: dataStatusOf(row.coveredDays, row.periodDays),
    updatedAt: row.updatedAt,
  };
}
