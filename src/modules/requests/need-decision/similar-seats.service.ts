import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import {
  AccessRequestEmployeeRequiredError,
  AccessRequestNotAssigneeError,
  AccessRequestNotFoundError,
} from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';

/** The most plans of other applications of the same functional group a head is shown seats of. */
export const SIMILAR_PLANS_LIMIT = 500;

export interface SimilarSeatView {
  assignmentId: string;
  plan: { planId: string; planName: string; applicationId: string; applicationName: string };
  accountIdentifier: string;
  heldSince: string;
}

/**
 * What the person a request is for already holds that does the same work as the tool asked for (`US-05-04` AC-3): the
 * seats they hold in the plans of the other applications of the same functional group. Only the person who holds the
 * need step sees them; it is a read, and it decides nothing. The catalog says which plans are alike and licensing which
 * of them the person holds, so the head learns of a duplicate before money is spent.
 */
@Injectable()
export class SimilarSeatsService {
  constructor(
    private readonly repo: AccessRequestRepo,
    private readonly catalog: CatalogApi,
    private readonly licensing: LicensingApi,
  ) {}

  async list(
    actor: AuthenticatedPrincipal,
    requestId: string,
    query: { page: number; pageSize: number; employeeId?: string },
  ): Promise<Page<SimilarSeatView>> {
    const request = await this.repo.findById(requestId);
    if (!request || !canViewRequest(actor, viewFactsOf(request))) {
      throw new AccessRequestNotFoundError();
    }
    const subject = this.subjectOf(actor, request, query.employeeId);

    // Software that is not in the catalog has no functional group to look in until it is registered.
    const similarPlanIds =
      request.planId === null ? [] : await this.catalog.getSimilarPlanIds(request.planId, SIMILAR_PLANS_LIMIT);
    const held = await this.licensing.getSeatsHeldInPlans(subject, similarPlanIds, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const plans = new Map(
      (await this.catalog.getPlanSummaries([...new Set(held.items.map((seat) => seat.planId))])).map((plan) => [
        plan.planId,
        plan,
      ]),
    );

    return pageOf(
      held.items.flatMap((seat) => {
        const plan = plans.get(seat.planId);

        return plan
          ? [{ assignmentId: seat.id, plan, accountIdentifier: seat.accountIdentifier, heldSince: seat.effectiveFrom }]
          : [];
      }),
      held.total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * The person whose seats are read: the one of a request for one person; for a group, the person named, who must be one of the
   * people of a step the caller holds (`US-05-17`).
   */
  private subjectOf(actor: AuthenticatedPrincipal, request: AccessRequestRecord, named: string | undefined): string {
    if (request.type !== 'GROUP_GRANT') {
      if (actor.employeeId !== request.needStep.assigneeEmployeeId) throw new AccessRequestNotAssigneeError();

      return request.beneficiaryEmployeeIds[0];
    }
    const held = new Set(
      request.needSteps.filter((step) => step.assigneeEmployeeId === actor.employeeId).map((step) => step.id),
    );
    if (held.size === 0) throw new AccessRequestNotAssigneeError();
    if (named === undefined) throw new AccessRequestEmployeeRequiredError();
    if (!request.lines.some((line) => line.employeeId === named && held.has(line.needStepId))) {
      throw new AccessRequestNotFoundError();
    }

    return named;
  }
}
