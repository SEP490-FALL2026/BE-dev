import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { GhostSeatSeatStateRepo, type SeatStatus } from '../ghost-seat/ghost-seat-seat-state.repo';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { RuleRunQueryService } from '../rule-run/rule-run-query.service';
import { toDetailWire, toRuleRunWire, toSummaryWire, type DetailReader, type RowNames } from './board.mapper';
import { narrowToDepartment, type DepartmentScope } from './board.policy';
import { GhostSeatNotDeciderError, GhostSeatNotFoundError } from './board.errors';

export interface RecommendationQuery {
  group?: GhostSeatRecord['group'];
  tier?: NonNullable<GhostSeatRecord['tier']>;
  state?: GhostSeatRecord['state'];
  applicationId?: string;
  departmentScope: DepartmentScope;
  departmentId?: string;
  employeeId?: string;
  page: number;
  pageSize: number;
}

export interface SeatStateQuery {
  applicationId?: string;
  status?: SeatStatus;
  departmentScope: DepartmentScope;
  departmentId?: string;
  employeeId?: string;
  page: number;
  pageSize: number;
}

const pageOf = (total: number, page: number, pageSize: number) => ({
  page,
  pageSize,
  totalItems: total,
  totalPages: Math.ceil(total / pageSize),
});

/**
 * What the IT Admin reads of the recommendations (`US-10-05`): the table, one recommendation, and the runs of the rules. The names a
 * row shows come in one read each for the whole page (the plans, the holders), never one for each row.
 */
@Injectable()
export class BoardQueryService {
  constructor(
    private readonly repo: GhostSeatRepo,
    private readonly seatStates: GhostSeatSeatStateRepo,
    private readonly runs: RuleRunQueryService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /**
   * The departments `MINE` stands for, or undefined for the whole organization (`ALL`): for an IT Admin the scope of `getItAdminScope` (the departments
   * that name them and, while a department has no usable IT Admin, that one too, R-20); for a head the department they head today.
   */
  private async scopeOf(actor: AuthenticatedPrincipal, scope: DepartmentScope): Promise<string[] | undefined> {
    if (scope === 'ALL') return undefined;
    if (actor.roles.includes('IT_ADMIN')) {
      return this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
        this.identity.findUsableItAdminEmployeeIds(ids),
      );
    }
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId);

    return headed ? [headed.departmentId] : [];
  }

  async list(actor: AuthenticatedPrincipal, query: RecommendationQuery) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return { items: [], pagination: pageOf(0, query.page, query.pageSize) };
    const narrowed = narrowToDepartment(await this.scopeOf(actor, query.departmentScope), query.departmentId);
    if (narrowed === 'OUT_OF_SCOPE') return { items: [], pagination: pageOf(0, query.page, query.pageSize) };
    const { items, total } = await this.repo.page(
      organization.id,
      {
        ...(query.group ? { group: query.group } : {}),
        ...(query.tier ? { tier: query.tier } : {}),
        ...(query.state ? { state: query.state } : {}),
        ...(query.applicationId ? { applicationId: query.applicationId } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...narrowed,
      },
      { skip: (query.page - 1) * query.pageSize, take: query.pageSize },
    );
    const names = await this.namesOf(items);

    return {
      items: items.map((record) => toSummaryWire(record, names(record))),
      pagination: pageOf(total, query.page, query.pageSize),
    };
  }

  /**
   * Throws GhostSeatNotFoundError, and GhostSeatNotDeciderError for a head who is not the head of the department that was asked
   * (`US-10-06` AC-8): an IT Admin reads any recommendation, a head only the ones about a seat of the department they head today.
   */
  async get(actor: AuthenticatedPrincipal, id: string) {
    const record = await this.repo.find(id);
    const organization = await this.organizationReads.getOrganization();
    if (!record || record.organizationId !== organization?.id) throw new GhostSeatNotFoundError();
    if (!actor.roles.includes('IT_ADMIN')) {
      const headed = await this.organizationReads.getHeadedDepartment(
        actor.employeeId,
        await this.organizationReads.businessToday(),
      );
      if (!headed || record.deciderDepartmentId !== headed.departmentId) throw new GhostSeatNotDeciderError();
    }

    return this.detailOf(record, actor.roles.includes('IT_ADMIN') ? 'IT_ADMIN' : 'HEAD');
  }

  /** The detail of a recommendation as the wire has it; a head reads the evidence in short (`SoD-2`). */
  async detailOf(record: GhostSeatRecord, reader: DetailReader = 'IT_ADMIN') {
    const names = await this.namesOf([record]);

    return toDetailWire(record, names(record), reader);
  }

  /**
   * What the last weekly pass of `G3`/`G4` found of each seat (`FR-5.10`, `US-10-05` AC-6): one state for each seat chain. A seat with no data, an
   * identity not matched or too little evidence has no days: it is never shown as inactive or as 0. The names come in one read each for the page.
   * The holders are the ones placed today in the departments of the scope (or the one asked for); a holder or a department outside it reads an empty page.
   */
  async listSeatStates(actor: AuthenticatedPrincipal, query: SeatStateQuery) {
    const organization = await this.organizationReads.getOrganization();
    const empty = { items: [], pagination: pageOf(0, query.page, query.pageSize) };
    if (!organization) return empty;
    const holderIds = await this.holdersInScope(actor, query);
    if (holderIds !== undefined && holderIds.length === 0) return empty;
    const { items, total } = await this.seatStates.seatStatePage(
      organization.id,
      {
        applicationId: query.applicationId,
        status: query.status,
        ...(holderIds ? { employeeIds: holderIds } : {}),
      },
      { skip: (query.page - 1) * query.pageSize, take: query.pageSize },
    );
    const applications = new Map(
      (await this.catalog.getCollectorApplications([...new Set(items.map((item) => item.applicationId))])).map(
        (application) => [application.id, application.name] as const,
      ),
    );
    const holders = new Map(
      (items.length === 0
        ? []
        : await this.organizationReads.getEmployees([...new Set(items.map((item) => item.employeeId))])
      ).map((employee) => [employee.id, employee] as const),
    );
    const hasDays = (status: SeatStatus): boolean => status === 'ACTIVE' || status === 'INACTIVE';

    return {
      items: items.map((item) => ({
        seatChainId: item.seatChainId,
        assignmentId: item.assignmentId,
        application: { applicationId: item.applicationId, applicationName: applications.get(item.applicationId) ?? '' },
        holder: holders.has(item.employeeId)
          ? {
              employeeId: item.employeeId,
              employeeCode: holders.get(item.employeeId)!.employeeCode,
            }
          : null,
        status: item.status,
        reason: item.gate,
        lastActiveDate: hasDays(item.status) ? item.lastActiveDate : null,
        inactiveDays: hasDays(item.status) ? item.inactiveDays : null,
        assessedOn: item.assessedOn,
      })),
      pagination: pageOf(total, query.page, query.pageSize),
    };
  }

  async listRuns(page: { page: number; pageSize: number }) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return { items: [], pagination: pageOf(0, page.page, page.pageSize) };
    const { items, total } = await this.runs.page(organization.id, {
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    });

    return {
      items: items.map(toRuleRunWire),
      pagination: pageOf(total, page.page, page.pageSize),
    };
  }

  /** Why a run left subjects out, one page. Throws GhostSeatNotFoundError for a run that does not exist. */
  async listSkips(runId: string, page: { page: number; pageSize: number }) {
    const organization = await this.organizationReads.getOrganization();
    const skips = organization
      ? await this.runs.skipsOf(organization.id, runId, { skip: (page.page - 1) * page.pageSize, take: page.pageSize })
      : null;
    if (!skips) throw new GhostSeatNotFoundError();

    return {
      items: skips.items.map((skip) => ({
        subjectType: skip.subjectType,
        subjectId: skip.subjectId,
        gate: skip.gate,
        detail: skip.detail,
      })),
      pagination: pageOf(skips.total, page.page, page.pageSize),
    };
  }

  /** The employees a seat-state read is limited to, or undefined for no limit; an empty list reads nothing. */
  private async holdersInScope(actor: AuthenticatedPrincipal, query: SeatStateQuery): Promise<string[] | undefined> {
    const narrowed = narrowToDepartment(await this.scopeOf(actor, query.departmentScope), query.departmentId);
    if (narrowed === 'OUT_OF_SCOPE') return [];
    const departments = narrowed.departmentId ? [narrowed.departmentId] : narrowed.departmentIds;
    const members = departments
      ? [
          ...new Set(
            (await Promise.all(departments.map((id) => this.organizationReads.getDepartmentMemberIds(id)))).flatMap(
              (ids) => ids ?? [],
            ),
          ),
        ]
      : undefined;
    if (query.employeeId === undefined) return members;

    return members === undefined || members.includes(query.employeeId) ? [query.employeeId] : [];
  }

  private async namesOf(records: readonly GhostSeatRecord[]): Promise<(record: GhostSeatRecord) => RowNames> {
    const plans = new Map(
      (await this.catalog.getPlanSummaries([...new Set(records.map((record) => record.planId))])).map((plan) => [
        plan.planId,
        plan,
      ]),
    );
    const holderIds = [...new Set(records.flatMap((record) => (record.employeeId ? [record.employeeId] : [])))];
    const holders = new Map(
      (holderIds.length === 0 ? [] : await this.organizationReads.getEmployees(holderIds)).map((employee) => [
        employee.id,
        employee,
      ]),
    );

    return (record) => {
      const plan = plans.get(record.planId);
      const holder = record.employeeId ? holders.get(record.employeeId) : undefined;

      return {
        planName: plan?.planName ?? '',
        applicationName: plan?.applicationName ?? '',
        holder: holder ? { employeeCode: holder.employeeCode } : null,
      };
    };
  }
}
