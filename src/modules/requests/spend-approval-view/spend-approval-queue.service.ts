import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { ApprovalSummaryWire } from './spend-approval.dto';
import { SpendApprovalQueueFactsService } from './spend-approval-queue-facts.service';
import { approvalSummaryOf } from './spend-approval.mapper';
import { SpendStepRepo } from '../spend/spend-step.repo';

/**
 * What waits for the spending approver (`US-06-01` AC-1): the spend steps given to them that are open, the oldest first, with what
 * each request is and what it costs. Only the person the step is given to reads it; the others are answered as if there were none.
 */
@Injectable()
export class SpendApprovalQueueService {
  constructor(
    private readonly steps: SpendStepRepo,
    private readonly facts: SpendApprovalQueueFactsService,
  ) {}

  /** The spend steps waiting for the caller, the oldest first. */
  async queue(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<Page<ApprovalSummaryWire>> {
    const { rows, total } = await this.steps.pageOpenSpendOf(
      actor.employeeId,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const lookups = await this.facts.load(rows);

    return pageOf(
      rows.map((row) => approvalSummaryOf(row, lookups)),
      total,
      query.page,
      query.pageSize,
    );
  }
}
