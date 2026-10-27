import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import type {
  TransferReviewDecisionWire,
  TransferReviewDetailWire,
  TransferReviewItemWire,
  TransferReviewSummaryWire,
} from './transfer-review.dto';
import { TransferReviewError } from './transfer-review.errors';
import { TransferReviewListRepo } from './transfer-review-list.repo';
import { employeeBriefOf, toItem, toSummary, type ReviewNames } from './transfer-review.mapper';
import type { DecisionOutcome } from './transfer-review-decision.service';
import type { ReviewItemRecord, ReviewListQuery, ReviewScope, ReviewSummaryRecord } from './transfer-review.types';

export interface Paged<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

const paged = <T>(items: T[], total: number, page: { page: number; pageSize: number }): Paged<T> => ({
  items,
  pagination: {
    page: page.page,
    pageSize: page.pageSize,
    totalItems: total,
    totalPages: Math.ceil(total / page.pageSize),
  },
});

/**
 * What the head and the IT Admin read of the reviews (`US-03-07` AC-9, AC-12). A head sees the reviews of the department they head
 * today; the IT Admin sees every review and only reads. Somebody who has nothing to do with a review is told it does not exist. A
 * page costs the same statements however many reviews or lines it holds, and usage is never shown, only why a seat was given.
 */
@Injectable()
export class TransferReviewViewService {
  constructor(
    private readonly lists: TransferReviewListRepo,
    private readonly organization: OrganizationService,
    private readonly catalog: CatalogService,
  ) {}

  async list(actor: AuthenticatedPrincipal, query: ReviewListQuery): Promise<Paged<TransferReviewSummaryWire>> {
    const today = await this.organization.businessToday();
    const { items, total } = await this.lists.list({
      scope: await this.scopeOf(actor, today),
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.overdue ? { overdue: true } : {}),
      today,
      page: query.page,
      pageSize: query.pageSize,
    });
    const names = await this.namesOf(items, [], today);

    return paged(
      items.map((record) => toSummary(record, names, today, actor.employeeId)),
      total,
      query,
    );
  }

  /** Throws TransferReviewError (`NOT_FOUND`), also for somebody the review has nothing to do with. */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<TransferReviewDetailWire> {
    const record = await this.visibleTo(actor, id);

    return this.detailOf(actor, record);
  }

  async detailOf(actor: AuthenticatedPrincipal, record: ReviewSummaryRecord): Promise<TransferReviewDetailWire> {
    const today = await this.organization.businessToday();
    const names = await this.namesOf([record], [], today);
    const reviewerId = names.heads.get(record.departmentId);
    const reviewer = reviewerId ? names.employees.get(reviewerId) : undefined;

    return {
      ...toSummary(record, names, today, actor.employeeId),
      reviewer: reviewer ? employeeBriefOf(reviewer) : null,
      transferId: record.transferId,
      openedAt: record.openedAt.toISOString(),
      completedAt: record.completedAt ? record.completedAt.toISOString() : null,
      overdueNoticedAt: record.overdueNoticedAt ? record.overdueNoticedAt.toISOString() : null,
    };
  }

  /** Throws TransferReviewError (`NOT_FOUND`). */
  async listItems(
    actor: AuthenticatedPrincipal,
    id: string,
    page: { page: number; pageSize: number },
  ): Promise<Paged<TransferReviewItemWire>> {
    await this.visibleTo(actor, id);
    const { items, total } = await this.lists.listItems(id, page);
    const names = await this.namesOf([], items, await this.organization.businessToday());

    return paged(
      items.map((item) => toItem(item, names)),
      total,
      page,
    );
  }

  /** The answer to a decision: the review as the caller reads it now and the line that was decided. */
  async decisionOf(actor: AuthenticatedPrincipal, outcome: DecisionOutcome): Promise<TransferReviewDecisionWire> {
    const today = await this.organization.businessToday();
    const summary = await this.lists.summaryOf(outcome.review.id);
    if (!summary) throw new TransferReviewError('NOT_FOUND');
    const names = await this.namesOf([summary], [outcome.item], today);

    return {
      review: toSummary(summary, names, today, actor.employeeId),
      item: toItem(outcome.item, names),
    };
  }

  private async visibleTo(actor: AuthenticatedPrincipal, id: string): Promise<ReviewSummaryRecord> {
    const record = await this.lists.summaryOf(id);
    if (!record) throw new TransferReviewError('NOT_FOUND');
    const scope = await this.scopeOf(actor, await this.organization.businessToday());
    const involved =
      scope.kind === 'ALL' ||
      (scope.kind === 'DEPARTMENT' && scope.departmentId === record.departmentId) ||
      (await this.lists.hasDecidedBy(id, actor.employeeId));
    if (!involved) throw new TransferReviewError('NOT_FOUND');

    return record;
  }

  private async scopeOf(actor: AuthenticatedPrincipal, today: BusinessDate): Promise<ReviewScope> {
    if (actor.roles.includes('IT_ADMIN')) return { kind: 'ALL' };
    const headed = await this.organization.getHeadedDepartment(actor.employeeId, today);

    return headed ? { kind: 'DEPARTMENT', departmentId: headed.departmentId } : { kind: 'NONE' };
  }

  /** The people, departments, plans and heads of a page, one statement each. */
  private async namesOf(
    reviews: readonly ReviewSummaryRecord[],
    items: readonly ReviewItemRecord[],
    today: BusinessDate,
  ): Promise<ReviewNames> {
    const unique = (values: readonly (string | null)[]) => [
      ...new Set(values.filter((value): value is string => value !== null)),
    ];
    const departmentIds = unique(reviews.map((review) => review.departmentId));
    const heads = await this.organization.getDepartmentHeads(departmentIds, today);
    const employeeIds = unique([
      ...reviews.map((review) => review.employeeId),
      ...items.map((item) => item.decidedByEmployeeId),
      ...[...heads.values()].map((head) => head.employeeId),
    ]);
    const planIds = unique(items.map((item) => item.planId));
    const [employees, departments, plans] = await Promise.all([
      employeeIds.length > 0 ? this.organization.getEmployees(employeeIds) : [],
      departmentIds.length > 0 ? this.organization.getDepartmentBriefs(departmentIds) : [],
      planIds.length > 0 ? this.catalog.getPlanRevocationInfo(planIds) : [],
    ]);

    return {
      employees: new Map(employees.map((employee) => [employee.id, employee])),
      departments: new Map(departments.map((department) => [department.id, department])),
      plans: new Map(plans.map((plan) => [plan.planId, plan])),
      heads: new Map([...heads].map(([departmentId, head]) => [departmentId, head.employeeId])),
    };
  }
}
