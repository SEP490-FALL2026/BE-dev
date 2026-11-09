import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { RuleRunQueryService } from '../rule-run/rule-run-query.service';
import { toDetailWire, toSummaryWire, type RowNames } from './board.mapper';
import { departmentsOfScope, type DepartmentScope } from './board.policy';
import { GhostSeatNotDeciderError, GhostSeatNotFoundError } from './board.errors';

export interface RecommendationQuery {
  group?: GhostSeatRecord['group'];
  tier?: NonNullable<GhostSeatRecord['tier']>;
  state?: GhostSeatRecord['state'];
  applicationId?: string;
  departmentScope: DepartmentScope;
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
    private readonly runs: RuleRunQueryService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
  ) {}

  async list(actor: AuthenticatedPrincipal, query: RecommendationQuery) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return { items: [], pagination: pageOf(0, query.page, query.pageSize) };
    const inCharge =
      query.departmentScope === 'MINE' ? await this.organizationReads.getDepartmentIdsInChargeOf(actor.employeeId) : [];
    const { items, total } = await this.repo.page(
      organization.id,
      {
        ...(query.group ? { group: query.group } : {}),
        ...(query.tier ? { tier: query.tier } : {}),
        ...(query.state ? { state: query.state } : {}),
        ...(query.applicationId ? { applicationId: query.applicationId } : {}),
        ...(departmentsOfScope(query.departmentScope, inCharge) ? { departmentIds: inCharge } : {}),
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

    return this.detailOf(record);
  }

  /** The detail of a recommendation as the wire has it. */
  async detailOf(record: GhostSeatRecord) {
    const names = await this.namesOf([record]);

    return toDetailWire(record, names(record));
  }

  async listRuns(page: { page: number; pageSize: number }) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return { items: [], pagination: pageOf(0, page.page, page.pageSize) };
    const { items, total } = await this.runs.page(organization.id, {
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    });

    return {
      items: items.map((run) => ({
        id: run.id,
        ruleSet: run.ruleSet,
        periodKey: run.periodKey,
        status: run.status,
        attempt: run.attempt,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        createdCount: run.createdCount,
        updatedCount: run.updatedCount,
        closedCount: run.closedCount,
        skippedCount: run.skippedCount,
        failedCount: run.failedCount,
      })),
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
        holder: holder ? { employeeCode: holder.employeeCode, fullName: holder.fullName } : null,
      };
    };
  }
}
