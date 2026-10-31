import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { PlanRevocationInfo } from '../../catalog/public/catalog.types';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import type { EmployeeRecord } from '../../organization/public/organization.types';
import { SeatTargetNotFoundError } from '../public/licensing.errors';
import { HandoverCaseFacts } from './handover-case-facts.service';
import { HandoverConfirmerResolver, type ResolvedConfirmer } from './handover-confirmer.service';
import { isOverdue } from './handover-confirmer.policy';
import type { HandoverDutyDetailWire, HandoverDutySummaryWire } from './handover.dto';
import { HandoverDutyError } from './handover.errors';
import { HandoverListRepo, type DutySummaryRecord } from './handover-list.repo';
import { HandoverRepo, type DutyRecord } from './handover.repo';

export interface HandoverListQuery {
  scope: 'mine' | 'all';
  status?: 'OPEN' | 'CONFIRMED' | 'CANCELLED';
  employeeId?: string;
  overdue?: boolean;
  page: number;
  pageSize: number;
}

export interface Paged<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

const statusOf = (duty: Pick<DutyRecord, 'confirmedAt' | 'cancelledAt'>): 'OPEN' | 'CONFIRMED' | 'CANCELLED' =>
  duty.cancelledAt ? 'CANCELLED' : duty.confirmedAt ? 'CONFIRMED' : 'OPEN';

const brief = (employee: EmployeeRecord) => ({
  id: employee.id,
  employeeCode: employee.employeeCode,
  fullName: employee.fullName,
});

/**
 * What the people a duty falls to, and the IT Admin, read of the handover (`US-03-09`, `US-07-09` AC-17, AC-18). A person sees the
 * duties of their own: those fixed to them, those of the people in the department they head today, and those of the head who
 * leaves when they are the one designated to follow. The IT Admin sees every duty and may only read. A person who has nothing to do
 * with a duty is told it does not exist. A page costs the same statements however many duties it holds.
 */
@Injectable()
export class HandoverViewService {
  constructor(
    private readonly repo: HandoverRepo,
    private readonly lists: HandoverListRepo,
    private readonly resolver: HandoverConfirmerResolver,
    private readonly facts: HandoverCaseFacts,
    private readonly history: OrganizationHistoryApi,
    private readonly organization: OrganizationApi,
    private readonly catalog: CatalogApi,
  ) {}

  /** Throws HandoverDutyError (`SCOPE_FORBIDDEN`) when someone who is not an IT Admin asks for every duty. */
  async list(actor: AuthenticatedPrincipal, query: HandoverListQuery): Promise<Paged<HandoverDutySummaryWire>> {
    const isItAdmin = actor.roles.includes('IT_ADMIN');
    if (query.scope === 'all' && !isItAdmin) throw new HandoverDutyError('SCOPE_FORBIDDEN');

    const today = await this.facts.today(new Date());
    const { items, total } = await this.lists.list({
      scope:
        query.scope === 'all'
          ? { kind: 'ALL' }
          : {
              kind: 'MINE',
              employeeId: actor.employeeId,
              isItAdmin,
              headPeriods: await this.history.getHeadPeriodsOf(actor.employeeId, today),
            },
      ...(query.status ? { status: query.status } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.overdue ? { overdue: true } : {}),
      today,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: await this.summaries(actor, items, today),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** Throws HandoverDutyError (`NOT_FOUND`), also for a person the duty has nothing to do with. */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<HandoverDutyDetailWire> {
    const duty = await this.repo.find(id);
    if (!duty) throw new HandoverDutyError('NOT_FOUND');

    const today = await this.facts.today(new Date());
    const resolved = (await this.resolver.resolve([duty], today)).get(duty.id);
    const involved =
      actor.roles.includes('IT_ADMIN') ||
      duty.confirmedByEmployeeId === actor.employeeId ||
      (resolved?.confirmer.employeeId ?? null) === actor.employeeId;
    if (!involved) throw new HandoverDutyError('NOT_FOUND');

    return this.detailOf(actor, duty, today, resolved);
  }

  async detailOf(
    actor: AuthenticatedPrincipal,
    duty: DutyRecord,
    today?: BusinessDate,
    known?: ResolvedConfirmer,
  ): Promise<HandoverDutyDetailWire> {
    const day = today ?? (await this.facts.today(new Date()));
    const resolved = known ?? (await this.resolver.resolve([duty], day)).get(duty.id);
    const planId = await this.repo.planOf(duty.assignmentId);
    if (!planId) throw new SeatTargetNotFoundError('PLAN');
    const confirmerIds = [resolved?.confirmer.employeeId, duty.confirmedByEmployeeId].filter(
      (value): value is string => typeof value === 'string',
    );
    const [names, plans] = await Promise.all([
      this.namesOf([duty.employeeId, ...confirmerIds]),
      this.plansOf([planId]),
    ]);
    const summary = this.summaryOf(actor, { ...duty, planId }, day, resolved, names, plans);
    const confirmer = resolved?.confirmer.employeeId ? names.get(resolved.confirmer.employeeId) : undefined;
    const confirmedBy = duty.confirmedByEmployeeId ? names.get(duty.confirmedByEmployeeId) : undefined;

    return {
      ...summary,
      noticeText: duty.noticeText,
      confirmer: confirmer ? brief(confirmer) : null,
      confirmation:
        duty.confirmedAt && duty.confirmedValue && duty.confirmedRole && confirmedBy
          ? {
              value: duty.confirmedValue,
              role: duty.confirmedRole,
              confirmedBy: brief(confirmedBy),
              confirmedAt: duty.confirmedAt.toISOString(),
              late: duty.confirmedLate,
            }
          : null,
      cancellation:
        duty.cancelledAt && duty.cancelReason
          ? { cancelledAt: duty.cancelledAt.toISOString(), reason: duty.cancelReason }
          : null,
      createdAt: duty.createdAt.toISOString(),
    };
  }

  private async summaries(
    actor: AuthenticatedPrincipal,
    items: readonly DutySummaryRecord[],
    today: BusinessDate,
  ): Promise<HandoverDutySummaryWire[]> {
    const [resolved, names, plans] = await Promise.all([
      this.resolver.resolve(items, today),
      this.namesOf(items.map((item) => item.employeeId)),
      this.plansOf(items.map((item) => item.planId)),
    ]);

    return items.map((item) => this.summaryOf(actor, item, today, resolved.get(item.id), names, plans));
  }

  private summaryOf(
    actor: AuthenticatedPrincipal,
    item: DutySummaryRecord,
    today: BusinessDate,
    resolved: ResolvedConfirmer | undefined,
    names: Map<string, EmployeeRecord>,
    plans: Map<string, PlanRevocationInfo>,
  ): HandoverDutySummaryWire {
    const employee = names.get(item.employeeId);
    const plan = plans.get(item.planId);
    if (!employee || !plan) throw new Error('A handover duty names a person or a plan that does not exist');
    const status = statusOf(item);
    const mayConfirm =
      item.confirmerRole === 'IT_ADMIN'
        ? actor.roles.includes('IT_ADMIN')
        : (resolved?.confirmer.employeeId ?? null) === actor.employeeId;

    return {
      id: item.id,
      assignmentId: item.assignmentId,
      application: { id: plan.applicationId, name: plan.applicationName },
      plan: { id: plan.planId, name: plan.planName },
      employee: brief(employee),
      source: item.source,
      role: item.confirmerRole,
      status,
      dataLoss: item.dataLoss,
      dueOn: item.dueOn,
      overdue: status === 'OPEN' && isOverdue(item.dueOn, today),
      flaggedUnconfirmed: item.proceededUnconfirmedAt !== null,
      waitingReason: status === 'OPEN' ? (resolved?.confirmer.waiting ?? null) : null,
      canConfirm: status === 'OPEN' && mayConfirm,
    };
  }

  private async namesOf(ids: readonly string[]): Promise<Map<string, EmployeeRecord>> {
    const unique = [...new Set(ids)];

    return new Map((await this.organization.getEmployees(unique)).map((employee) => [employee.id, employee]));
  }

  private async plansOf(ids: readonly string[]): Promise<Map<string, PlanRevocationInfo>> {
    const unique = [...new Set(ids)];

    return new Map((await this.catalog.getPlanRevocationInfo(unique)).map((plan) => [plan.planId, plan]));
  }
}
