import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import type {
  SaasIssueEligibleWire,
  SaasIssueEntryWire,
  SaasIssueOptionsWire,
  SaasIssueSummaryWire,
  SaasIssueWire,
} from './saas-issue.dto';
import { SaasIssueError } from './saas-issue.errors';
import { toDetail, toEntry, toSummary, type IssueNames } from './saas-issue.mapper';
import {
  DESCRIPTION_MAX_LENGTH,
  SAAS_ISSUE_CATEGORY_LABELS,
  SAAS_ISSUE_IMPACT_LABELS,
  SAAS_ISSUE_SECRET_WARNING,
  type SaasIssueState,
} from './saas-issue.policy';
import { SaasIssueFactsRepo } from './saas-issue-facts.repo';
import { SaasIssueRepo, type SaasIssueRecord } from './saas-issue.repo';

export interface ListIssuesQuery {
  scope?: 'mine' | 'assigned' | 'all';
  state?: SaasIssueState;
  overdue?: boolean;
  reporterEmployeeId?: string;
  page: number;
  pageSize: number;
}

/**
 * Reads the reports (`US-07-10` AC-1, AC-8): the reporter sees their own, an IT Admin sees those given to them or all of them, and
 * nobody else sees any: a report of another person is as if it did not exist, so the head of a department reads none. The names of a
 * page are read once for the whole page, so the number of statements does not grow with its size.
 */
@Injectable()
export class SaasIssueViewService {
  constructor(
    private readonly issues: SaasIssueRepo,
    private readonly facts: SaasIssueFactsRepo,
    private readonly organization: OrganizationApi,
    private readonly catalog: CatalogApi,
  ) {}

  /** The form: the warning, the categories and impacts, and the page of the rights the caller may report on. */
  async options(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<SaasIssueOptionsWire> {
    const today = await this.organization.businessToday();
    const { items, total } = await this.facts.eligiblePage(actor.employeeId, today, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const plans = new Map(
      (await this.catalog.getPlanSummaries([...new Set(items.map((item) => item.planId))])).map((plan) => [
        plan.planId,
        plan,
      ]),
    );
    const eligible: SaasIssueEligibleWire[] = items.map((item) => ({
      assignmentId: item.assignmentId,
      plan: {
        planId: item.planId,
        planName: plans.get(item.planId)?.planName ?? '',
        applicationName: plans.get(item.planId)?.applicationName ?? '',
      },
      grantTaskId: item.grantTaskId,
    }));

    return {
      secretWarning: { ...SAAS_ISSUE_SECRET_WARNING },
      descriptionMaxLength: DESCRIPTION_MAX_LENGTH,
      categories: { ...SAAS_ISSUE_CATEGORY_LABELS },
      impacts: { ...SAAS_ISSUE_IMPACT_LABELS },
      ...pageOf(eligible, total, query.page, query.pageSize),
    };
  }

  async list(actor: AuthenticatedPrincipal, query: ListIssuesQuery): Promise<Page<SaasIssueSummaryWire>> {
    const isItAdmin = actor.roles.includes('IT_ADMIN');
    const scope = query.scope ?? (isItAdmin ? 'assigned' : 'mine');
    if (scope !== 'mine' && !isItAdmin) throw new SaasIssueError('SCOPE_FORBIDDEN');
    // The reports of someone else are not among the caller's own.
    if (scope === 'mine' && query.reporterEmployeeId && query.reporterEmployeeId !== actor.employeeId) {
      return pageOf([], 0, query.page, query.pageSize);
    }
    const today = await this.organization.businessToday();
    const reporterEmployeeId = scope === 'mine' ? actor.employeeId : query.reporterEmployeeId;
    const { items, total } = await this.issues.page({
      ...(reporterEmployeeId ? { reporterEmployeeId } : {}),
      ...(scope === 'assigned' ? { assignedItAdminEmployeeId: actor.employeeId } : {}),
      ...(query.overdue ? { overdueBefore: today } : query.state ? { state: query.state } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const names = await this.namesOf(items, today);

    return pageOf(
      items.map((record) => toSummary(record, names)),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** The report the caller may see, or SaasIssueError `NOT_FOUND`. */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<SaasIssueWire> {
    const record = await this.visible(actor, id);

    return (await this.wireOf([record]))[0];
  }

  /** The reports as they are answered in detail, in the order they were given. */
  async wireOf(records: readonly SaasIssueRecord[]): Promise<SaasIssueWire[]> {
    const names = await this.namesOf(records, await this.organization.businessToday());

    return records.map((record) => toDetail(record, names));
  }

  async entries(
    actor: AuthenticatedPrincipal,
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<SaasIssueEntryWire>> {
    await this.visible(actor, id);
    const { items, total } = await this.issues.entriesPage(id, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const people = await this.organization.getEmployees([
      ...new Set(items.flatMap((item) => [item.authorEmployeeId, item.onBehalfOfEmployeeId]).filter(isPresent)),
    ]);
    const byId = new Map(people.map((person) => [person.id, person]));
    const employee = (employeeId: string) => briefOf(byId.get(employeeId), employeeId);

    return pageOf(
      items.map((item) => toEntry(item, employee)),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** The report when the caller is its reporter or an IT Admin; otherwise it does not exist for them. */
  private async visible(actor: AuthenticatedPrincipal, id: string): Promise<SaasIssueRecord> {
    const record = await this.issues.find(id);
    if (!record || (record.reporterEmployeeId !== actor.employeeId && !actor.roles.includes('IT_ADMIN'))) {
      throw new SaasIssueError('NOT_FOUND');
    }

    return record;
  }

  private async namesOf(records: readonly SaasIssueRecord[], today: string): Promise<IssueNames> {
    const planIdOf = await this.facts.planIdsOf([...new Set(records.map((record) => record.assignmentId))]);
    const originalIds = [...new Set(records.map((record) => record.duplicateOfId).filter(isPresent))];
    const [people, plans, originals] = await Promise.all([
      this.organization.getEmployees([
        ...new Set(records.flatMap((record) => [record.reporterEmployeeId, record.assignedItAdminEmployeeId])),
      ]),
      this.catalog.getPlanSummaries([...new Set(planIdOf.values())]),
      this.issues.findMany(originalIds),
    ]);
    const personById = new Map(people.map((person) => [person.id, person]));
    const planById = new Map(plans.map((plan) => [plan.planId, plan]));
    const codeById = new Map(originals.map((original) => [original.id, original.code]));

    return {
      today,
      employee: (id) => briefOf(personById.get(id), id),
      plan: (assignmentId) => {
        const planId = planIdOf.get(assignmentId) ?? '';
        const plan = planById.get(planId);

        return { planId, planName: plan?.planName ?? '', applicationName: plan?.applicationName ?? '' };
      },
      originalCode: (id) => codeById.get(id) ?? '',
    };
  }
}

const isPresent = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

function briefOf(person: { employeeCode: string; fullName: string } | undefined, employeeId: string) {
  return { employeeId, employeeCode: person?.employeeCode ?? '', fullName: person?.fullName ?? '' };
}
