import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { budgetAuditEvent } from '../budget/budget-facts.service';
import { BudgetAttachmentNotAttachableError } from './budget-attachment.errors';
import { BudgetAttachmentRepo } from './budget-attachment.repo';

@Injectable()
export class ProposalAttachmentBinder {
  constructor(
    private readonly attachments: BudgetAttachmentRepo,
    private readonly audit: AuditApi,
  ) {}

  async bind(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    proposalId: string,
    attachmentIds: readonly string[],
  ): Promise<void> {
    if (attachmentIds.length === 0) return;

    const locked = await this.attachments.lockManyAsc(tx, [...attachmentIds]);
    const byId = new Map(locked.map((a) => [a.id, a]));

    const invalidIds: string[] = [];
    for (const id of attachmentIds) {
      const record = byId.get(id);
      const isValid =
        record &&
        record.target === 'PROPOSAL' &&
        record.status === 'UPLOADED' &&
        record.uploadedByEmployeeId === actor.employeeId;

      if (!isValid) {
        invalidIds.push(id);
      }
    }

    if (invalidIds.length > 0) {
      throw new BudgetAttachmentNotAttachableError(invalidIds);
    }

    const attachedAt = new Date();
    for (const id of attachmentIds) {
      const record = byId.get(id)!;
      await this.attachments.markAttachedProposal(tx, id, proposalId, attachedAt);
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, record.organizationId, 'BUDGET_ATTACHMENT.ATTACHED', 'BUDGET_ATTACHMENT', id, {
          target: 'PROPOSAL',
          proposalId,
        }),
      );
    }
  }
}
