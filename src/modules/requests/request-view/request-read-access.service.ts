import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { canReadRequest, type ReadAccess, type ViewFacts } from '../access-request/access-request.policy';
import { RequestReadRepo } from './request-read.repo';

/** What a reader of one request is judged on before the facts that cost a read are loaded. */
export interface ReadSubject extends ViewFacts {
  id: string;
  isGroup: boolean;
  departmentId: string;
  /** Known already by the caller (the steps it read); loaded here when absent. */
  spendStepOpened?: boolean;
}

/**
 * Who reads one request (its detail, its time, its people, its history), by `canReadRequest`. The facts that cost a read are loaded
 * only for a caller whose role could open the request through them: the department headed today for a head, how far the request went
 * for a spending approver or Finance. Finance also reads a request that holds a commitment the way the budgets module tells it.
 */
@Injectable()
export class RequestReadAccessService {
  constructor(
    private readonly repo: RequestReadRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly budgets: BudgetsApi,
  ) {}

  async accessOf(actor: AuthenticatedPrincipal, subject: ReadSubject): Promise<ReadAccess> {
    const facts = {
      ...subject,
      actorHeadsDepartmentId: null,
      spendStepOpened: subject.spendStepOpened ?? false,
      spendApproved: false,
    };
    const first = canReadRequest(actor, facts);
    if (first.read && first.onlyLineOf === null) return first;

    const { roles } = actor;
    const heads = roles.includes('MANAGER') ? await this.organizationReads.getHeadedDepartment(actor.employeeId) : null;
    const money = roles.includes('SPENDING_APPROVER') || roles.includes('FINANCE');
    const spend = money ? await this.repo.spendFactsOf(subject.id) : { spendStepOpened: false, spendApproved: false };
    const spendApproved =
      spend.spendApproved || (roles.includes('FINANCE') && (await this.budgets.requestHoldsCommitment(subject.id)));

    return canReadRequest(actor, {
      ...facts,
      actorHeadsDepartmentId: heads?.departmentId ?? null,
      spendStepOpened: facts.spendStepOpened || spend.spendStepOpened,
      spendApproved,
    });
  }
}
