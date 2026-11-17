import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import type { ChecklistBody, ChecklistVerdict } from '../../policies/public/policy-checklist.types';
import type { AccessRequestRecord } from '../access-request/access-request.types';

/**
 * What the confirmation of the reserve asks beside the check of the budget: who heads a department today, and the checklist of the step
 * (`QĐ-111ap`, `QĐ-111be`): a No locks the confirmation, and the answers are kept only with a confirmation that was kept.
 */
@Injectable()
export class ReserveConfirmationChecklist {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly checklists: PolicyChecklistApi,
  ) {}

  /** The department the person heads today, or null. */
  async headedDepartmentId(actor: AuthenticatedPrincipal): Promise<string | null> {
    const today = await this.organizationReads.businessToday();

    return (await this.organizationReads.getHeadedDepartment(actor.employeeId, today))?.departmentId ?? null;
  }

  /** Throws the errors of the checklist: the version left behind, answers missing, an answer No. */
  async judge(tx: DbTx, request: AccessRequestRecord, checklist: ChecklistBody): Promise<ChecklistVerdict> {
    return this.judgeFor(tx, request.organizationId, checklist);
  }

  /** The one checklist of a batch that confirms the reserve of some of its requests (`QĐ-111aq`): same errors, told once for the whole batch. */
  judgeFor(tx: DbTx, organizationId: string, checklist: ChecklistBody): Promise<ChecklistVerdict> {
    return this.checklists
      .judge(tx, { organizationId, stepCode: '1.6', checklist, decision: 'CONFIRM' })
      .then(({ verdict }) => verdict);
  }

  record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    kept: { verdict: ChecklistVerdict; decidedAt: Date },
  ): Promise<void> {
    return this.recordFor(tx, actor, request.organizationId, { ...kept, requestIds: [request.id] });
  }

  /** The same answers once for each request whose confirmation was kept. */
  recordFor(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    kept: { verdict: ChecklistVerdict; decidedAt: Date; requestIds: readonly string[] },
  ): Promise<void> {
    return this.checklists.record(tx, {
      organizationId,
      verdict: kept.verdict,
      decision: 'CONFIRM',
      decidedByEmployeeId: actor.employeeId,
      decidedAt: kept.decidedAt,
      subjects: kept.requestIds.map((id) => ({ kind: 'ACCESS_REQUEST' as const, id })),
    });
  }
}
