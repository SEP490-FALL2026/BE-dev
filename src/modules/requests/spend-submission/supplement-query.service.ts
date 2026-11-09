import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { GroupSupplementService } from '../group-request/group-supplement.service';
import { SpendWireViewService } from '../spend/spend-wire-view.service';
import type { SupplementWire } from '../spend/spend-submission.dto';
import { SupplementRepo, type SupplementRecord } from './supplement.repo';

/** The supplementary files of a request as they are shown (`QĐ-82n`): oldest first, to the people who may read the request. */
@Injectable()
export class SupplementQueryService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly supplements: SupplementRepo,
    private readonly wireView: SpendWireViewService,
    private readonly groups: GroupSupplementService,
  ) {}

  /** The supplementary files of the request, oldest first; read by the people who may read the request. */
  async list(
    actor: AuthenticatedPrincipal,
    requestId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<SupplementWire>> {
    const request = await this.requests.findById(requestId);
    const visible = request !== null && canViewRequest(actor, viewFactsOf(request));
    if (!visible) throw new AccessRequestNotFoundError();

    const { items, total } = await this.supplements.page(requestId, (query.page - 1) * query.pageSize, query.pageSize);

    return pageOf(await this.wires(requestId, items), total, query.page, query.pageSize);
  }

  async wires(requestId: string, records: readonly SupplementRecord[]): Promise<SupplementWire[]> {
    const dropped = await this.groups.droppedBy(
      requestId,
      records.map((record) => record.number),
    );
    const people = await this.wireView.people(records.map((record) => record.changedByEmployeeId));

    return Promise.all(
      records.map(async (record): Promise<SupplementWire> => {
        const money = await this.wireView.formatter(record.currency ?? 'VND');
        const changedBy = people.get(record.changedByEmployeeId);
        if (!changedBy) throw new Error('A supplementary file points at a missing person.');

        return {
          number: record.number,
          reason: record.reason,
          changedBy,
          createdAt: record.createdAt.toISOString(),
          budgetYear: { before: record.beforeBudgetYear ?? 0, after: record.afterBudgetYear ?? 0 },
          amount: { before: money(record.beforeAmountMinor), after: money(record.afterAmountMinor) },
          droppedCount: (dropped.get(record.number) ?? []).length,
        };
      }),
    );
  }
}
