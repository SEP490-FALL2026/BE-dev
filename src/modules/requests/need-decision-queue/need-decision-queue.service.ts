import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SpendWireViewService } from '../spend/spend-wire-view.service';
import { StepDueOnService } from '../spend-approval-view/step-due-on.service';
import type { NeedQueueItemWire } from './need-decision-queue.dto';
import { needQueueItemOf, type NeedQueueLookups } from './need-decision-queue.mapper';
import { NeedDecisionQueueRepo, type NeedQueueRow, type NeedQueueType } from './need-decision-queue.repo';

/**
 * What waits for the person who holds need steps (`US-05-04`): the need steps given to them now that are pending, the oldest first,
 * with what each request is and what they decide about it. The step is what is read, not the department or the role in the token,
 * so the head, the spending approver who decides the need of a head's own request, and the fallback approver each read what the
 * routing gave them, a person who takes over a step reads it on the next call, and nobody reads a step that is not theirs. The
 * queue only reads: the decision is made, and checked again on the locked request, in the routes of the need decision.
 */
@Injectable()
export class NeedDecisionQueueService {
  constructor(
    private readonly steps: NeedDecisionQueueRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly wireView: SpendWireViewService,
    private readonly deadlines: StepDueOnService,
  ) {}

  /** The need steps waiting for the caller, the oldest first. */
  async queue(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number; type?: NeedQueueType },
  ): Promise<Page<NeedQueueItemWire>> {
    const { rows, total } = await this.steps.pageOpenOf(actor.employeeId, {
      type: query.type,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const lookups = await this.lookupsFor(rows);

    return pageOf(
      rows.map((row) => needQueueItemOf(row, lookups)),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Everything a page is read against, one read of each whatever the size of the page. */
  private async lookupsFor(rows: readonly NeedQueueRow[]): Promise<NeedQueueLookups> {
    if (rows.length === 0) return { people: new Map(), plans: [], departments: [], units: new Map(), due: new Map() };
    const planIds = [...new Set(rows.flatMap(({ request }) => (request.planId === null ? [] : [request.planId])))];
    const [people, plans, departments, units, due] = await Promise.all([
      this.wireView.people(
        rows.flatMap(({ request }) => [
          request.requesterEmployeeId,
          request.type === 'GROUP_GRANT' ? null : (request.beneficiaries[0]?.employeeId ?? null),
        ]),
      ),
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.organizationReads.getDepartmentBriefs([...new Set(rows.map(({ request }) => request.departmentId))]),
      this.wireView.units(rows.map(({ request }) => request.amountCurrency)),
      this.deadlines.dueOn(
        rows.map((row) => ({ id: row.id, createdAt: row.createdAt, slaWorkingDays: row.slaWorkingDays })),
      ),
    ]);

    return { people, plans, departments, units, due };
  }
}
