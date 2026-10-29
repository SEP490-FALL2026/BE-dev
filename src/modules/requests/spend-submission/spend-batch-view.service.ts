import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationApi } from '../../organization/public/organization.api';
import { SpendBatchRepo, type BatchRecord } from '../spend/spend-batch.repo';
import { SpendBatchNotFoundError } from '../spend/spend.errors';
import { SpendReadSupport } from '../spend/spend-read.service';
import { SpendRequestRepo } from '../spend/spend-request.repo';
import type { BatchItemWire, BatchWire } from '../spend/spend-submission.dto';

/**
 * What is read of a batch (`US-06-14` AC-1, AC-3): who sent it, when, and its items. It has no state of decision and no
 * commitment, so none is shown; each item says how it fared and where the request is now. The head who sent it reads all of
 * it; the person a request of it was given to for the spend reads the requests they hold, and the request that left their
 * batch because they were in conflict is not among them. Nobody else reads it, and is answered as if it did not exist.
 */
@Injectable()
export class SpendBatchViewService {
  constructor(
    private readonly batches: SpendBatchRepo,
    private readonly found: SpendRequestRepo,
    private readonly organization: OrganizationApi,
    private readonly support: SpendReadSupport,
  ) {}

  /** Throws SpendBatchNotFoundError. */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<BatchWire> {
    const batch = await this.readable(actor, id);
    const [people, department] = await Promise.all([
      this.support.people([batch.submittedByEmployeeId]),
      this.organization.getDepartmentBrief(batch.departmentId),
    ]);
    const submittedBy = people.get(batch.submittedByEmployeeId);
    if (!submittedBy || !department) throw new Error(`The batch ${id} points at a missing record.`);

    return {
      id: batch.id,
      department: { id: department.id, code: department.code },
      submittedBy,
      submittedAt: batch.submittedAt.toISOString(),
      itemCount: batch.itemCount,
    };
  }

  /** Throws SpendBatchNotFoundError. */
  async items(
    actor: AuthenticatedPrincipal,
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<BatchItemWire>> {
    const batch = await this.readable(actor, id);
    const own = batch.submittedByEmployeeId === actor.employeeId;
    const held = own ? undefined : await this.batches.heldBy(id, actor.employeeId);
    const { items, total } = await this.batches.pageItems(id, (query.page - 1) * query.pageSize, query.pageSize, held);
    const states = await this.found.statesOf(items.map((item) => item.requestId));

    return pageOf(
      items.map((item): BatchItemWire => ({
        requestId: item.requestId,
        position: item.position,
        outcome: item.outcome,
        stopReason: item.stopReason,
        leftReason: item.leftReason,
        leftAt: item.leftAt?.toISOString() ?? null,
        requestState: states.get(item.requestId) as BatchItemWire['requestState'],
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  private async readable(actor: AuthenticatedPrincipal, id: string): Promise<BatchRecord> {
    const batch = await this.batches.findById(id);
    if (!batch) throw new SpendBatchNotFoundError();
    if (batch.submittedByEmployeeId === actor.employeeId) return batch;
    if ((await this.batches.heldBy(id, actor.employeeId)).length > 0) return batch;

    throw new SpendBatchNotFoundError();
  }
}
