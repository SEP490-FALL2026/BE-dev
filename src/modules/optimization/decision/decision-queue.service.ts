import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { GhostSeatDecisionRepo } from '../ghost-seat/ghost-seat-decision.repo';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';

const pageOf = (total: number, page: number, pageSize: number) => ({
  page,
  pageSize,
  totalItems: total,
  totalPages: Math.ceil(total / pageSize),
});

const holderOf = (
  employeeId: string | null,
  holders: ReadonlyMap<string, { employeeCode: string; fullName: string }>,
) => {
  const holder = employeeId ? holders.get(employeeId) : undefined;

  return { employeeId: employeeId ?? '', employeeCode: holder?.employeeCode ?? '', fullName: holder?.fullName ?? '' };
};

const isPastDue = (dueOn: string | null, today: string): boolean => dueOn !== null && dueOn < today;

/**
 * What the head of a department reads of the recommendations about the seats of their department (`US-10-06` AC-1, `QĐ-101i`): the ones that
 * wait for them or were returned to them, a person's rows together, with the fields the head decides on and no usage volume. The names of a
 * page come in one read each, never one per row.
 */
@Injectable()
export class DecisionQueueService {
  constructor(
    private readonly repo: GhostSeatRepo,
    private readonly decisions: GhostSeatDecisionRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
  ) {}

  async list(actor: AuthenticatedPrincipal, query: { page: number; pageSize: number }) {
    const organization = await this.organizationReads.getOrganization();
    const today = await this.organizationReads.businessToday();
    const headed = organization ? await this.organizationReads.getHeadedDepartment(actor.employeeId, today) : null;
    if (!organization || !headed)
      return { items: [], holderCount: 0, pagination: pageOf(0, query.page, query.pageSize) };
    const { items, total } = await this.repo.queuePage(organization.id, headed.departmentId, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const ids = items.map((record) => record.id);
    const plans = new Map(
      (await this.catalog.getPlanSummaries([...new Set(items.map((record) => record.planId))])).map(
        (plan) => [plan.planId, plan] as const,
      ),
    );
    const holderIds = [...new Set(items.flatMap((record) => record.employeeId ?? []))];
    const holders = new Map(
      (holderIds.length === 0 ? [] : await this.organizationReads.getEmployees(holderIds)).map(
        (employee) => [employee.id, employee] as const,
      ),
    );
    const returns = await this.decisions.returnsOf(ids);
    const previous = await this.decisions.latestDecisionsOf(ids);

    return {
      items: items.map((record) => this.wireOf(record, { actor, today, plans, holders, returns, previous })),
      holderCount: holderIds.length,
      pagination: pageOf(total, query.page, query.pageSize),
    };
  }

  private wireOf(
    record: GhostSeatRecord,
    ctx: {
      actor: AuthenticatedPrincipal;
      today: string;
      plans: ReadonlyMap<string, { planName: string; applicationName: string }>;
      holders: ReadonlyMap<string, { employeeCode: string; fullName: string }>;
      returns: ReadonlyMap<string, { reason: string }>;
      previous: ReadonlyMap<string, { choice: 'KEEP' | 'RECLAIM' | 'EXEMPT'; reason: string; decidedOn: string }>;
    },
  ) {
    const plan = ctx.plans.get(record.planId);
    const before = ctx.previous.get(record.id);

    return {
      id: record.id,
      group: record.group,
      tier: record.tier,
      state: record.state,
      holder: holderOf(record.employeeId, ctx.holders),
      selfSeat: record.employeeId === ctx.actor.employeeId,
      application: { applicationId: record.applicationId, applicationName: plan?.applicationName ?? '' },
      plan: { planId: record.planId, planName: plan?.planName ?? '' },
      decisionDueOn: record.decisionDueOn,
      overdue: isPastDue(record.decisionDueOn, ctx.today),
      returnReason: ctx.returns.get(record.id)?.reason ?? null,
      previousDecision: before ? { choice: before.choice, reason: before.reason, decidedOn: before.decidedOn } : null,
      evidence: { ...record.evidence },
      createdAt: record.createdAt.toISOString(),
    };
  }

  /** The decisions, newest first, for the Super Admin: with `selfDecided` the report of what heads decided on their own seats (`US-10-03` AC-13). */
  async listDecisions(query: { selfDecided?: boolean; page: number; pageSize: number }) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return { items: [], pagination: pageOf(0, query.page, query.pageSize) };
    const { items, total } = await this.decisions.decisionsPage(
      organization.id,
      query.selfDecided === undefined ? {} : { selfDecided: query.selfDecided },
      { skip: (query.page - 1) * query.pageSize, take: query.pageSize },
    );
    const people = new Map(
      (await this.organizationReads.getEmployees([...new Set(items.map((item) => item.decidedByEmployeeId))])).map(
        (employee) => [employee.id, employee] as const,
      ),
    );

    return {
      items: items.map((item) => ({
        id: item.id,
        recommendationId: item.recommendationId,
        choice: item.choice,
        reason: item.reason,
        exemptUntil: item.exemptUntil,
        decidedOn: item.decidedOn,
        decidedAt: item.decidedAt.toISOString(),
        decidedBy: {
          employeeId: item.decidedByEmployeeId,
          employeeCode: people.get(item.decidedByEmployeeId)?.employeeCode ?? '',
          fullName: people.get(item.decidedByEmployeeId)?.fullName ?? '',
        },
        deciderDepartmentId: item.deciderDepartmentId,
        selfDecided: item.selfDecided,
      })),
      pagination: pageOf(total, query.page, query.pageSize),
    };
  }

  /** The exemptions: a head reads those of their department, an IT Admin all of them and changes none (`US-10-08` AC-1, AC-7). */
  async listExemptions(actor: AuthenticatedPrincipal, query: { page: number; pageSize: number }) {
    const organization = await this.organizationReads.getOrganization();
    const empty = { items: [], pagination: pageOf(0, query.page, query.pageSize) };
    if (!organization) return empty;
    const itAdmin = actor.roles.includes('IT_ADMIN');
    const today = await this.organizationReads.businessToday();
    const headed = itAdmin ? null : await this.organizationReads.getHeadedDepartment(actor.employeeId, today);
    if (!itAdmin && !headed) return empty;
    const { items, total } = await this.decisions.exemptionsPage(
      organization.id,
      headed ? { departmentId: headed.departmentId } : {},
      { skip: (query.page - 1) * query.pageSize, take: query.pageSize },
    );
    const plans = new Map(
      (await this.catalog.getPlanSummaries([...new Set(items.map((item) => item.planId))])).map(
        (plan) => [plan.planId, plan] as const,
      ),
    );
    const holderIds = [...new Set(items.flatMap((item) => item.employeeId ?? []))];
    const holders = new Map(
      (holderIds.length === 0 ? [] : await this.organizationReads.getEmployees(holderIds)).map(
        (employee) => [employee.id, employee] as const,
      ),
    );

    return {
      items: items.map((item) => {
        const holder = item.employeeId ? holders.get(item.employeeId) : undefined;

        return {
          id: item.id,
          recommendationId: item.recommendationId,
          holder:
            item.employeeId && holder
              ? { employeeId: item.employeeId, employeeCode: holder.employeeCode, fullName: holder.fullName }
              : null,
          application: {
            applicationId: item.applicationId,
            applicationName: plans.get(item.planId)?.applicationName ?? '',
          },
          exemptUntil: item.exemptUntil,
          createdAt: item.createdAt.toISOString(),
          remindedAt: item.remindedAt?.toISOString() ?? null,
          endedAt: item.endedAt?.toISOString() ?? null,
        };
      }),
      pagination: pageOf(total, query.page, query.pageSize),
    };
  }
}
