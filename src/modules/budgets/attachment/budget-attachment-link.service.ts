import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo } from '../budget/version.repo';
import { BudgetAttachmentNotFoundError } from './budget-attachment.errors';
import { budgetRecordView } from './budget-attachment.policy';
import { BudgetAttachmentRepo } from './budget-attachment.repo';
import type { BudgetAttachmentRecord } from './budget-attachment.types';

const LINK_EXPIRY_SECONDS = 300;

@Injectable()
export class BudgetAttachmentLinkService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly attachments: BudgetAttachmentRepo,
    private readonly facts: BudgetFactsService,
    private readonly proposals: ProposalRepo,
    private readonly versions: VersionRepo,
    private readonly audit: AuditApi,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async issue(actor: AuthenticatedPrincipal, attachmentId: string): Promise<{ url: string; expiresAt: string }> {
    const record = await this.attachments.find(attachmentId);
    if (!record || !record.finalObjectKey) {
      throw new BudgetAttachmentNotFoundError();
    }

    await this.assertCanRead(actor, record);

    const expiresAtDate = new Date(Date.now() + LINK_EXPIRY_SECONDS * 1000);
    const expiresAt = expiresAtDate.toISOString();

    const url = await this.storage.createDownloadUrl({
      key: record.finalObjectKey,
      fileName: record.fileName,
      contentType: record.contentType,
      expiresInSeconds: LINK_EXPIRY_SECONDS,
    });

    await this.runner.run(async (tx) => {
      await this.audit.record(
        tx,
        budgetAuditEvent(
          actor,
          record.organizationId,
          'BUDGET_ATTACHMENT.LINK_ISSUED',
          'BUDGET_ATTACHMENT',
          record.id,
          { expiresAt },
        ),
      );
    });

    return { url, expiresAt };
  }

  private async assertCanRead(actor: AuthenticatedPrincipal, record: BudgetAttachmentRecord): Promise<void> {
    if (record.status === 'UPLOADED') {
      if (record.uploadedByEmployeeId !== actor.employeeId) {
        throw new BudgetAttachmentNotFoundError();
      }
      return;
    }

    if (record.status !== 'ATTACHED' && record.status !== 'REMOVED') {
      throw new BudgetAttachmentNotFoundError();
    }

    if (record.target === 'PROPOSAL') {
      await this.assertProposalAccess(actor, record);
    } else {
      await this.assertVersionAccess(actor, record);
    }
  }

  private async assertProposalAccess(actor: AuthenticatedPrincipal, record: BudgetAttachmentRecord): Promise<void> {
    if (!record.proposalId || record.status !== 'ATTACHED') {
      throw new BudgetAttachmentNotFoundError();
    }
    const proposal = await this.proposals.findById(record.proposalId);
    if (!proposal) {
      throw new BudgetAttachmentNotFoundError();
    }

    const today = await this.facts.today(new Date());
    const isFinance = actor.roles.includes('FINANCE');
    const isDecider = await this.facts.isSpendingApprover(actor.employeeId);
    const headedCostCenterId = await this.facts.headedCostCenter(actor.employeeId, today);

    const view = budgetRecordView({
      isFinance,
      isDecider,
      headedCostCenterId,
      recordCostCenterId: proposal.costCenterId,
      versionSentAt: undefined,
    });

    if (view === 'NONE') {
      throw new BudgetAttachmentNotFoundError();
    }
  }

  private async assertVersionAccess(actor: AuthenticatedPrincipal, record: BudgetAttachmentRecord): Promise<void> {
    if (!record.versionId) {
      throw new BudgetAttachmentNotFoundError();
    }
    const version = await this.versions.findById(record.versionId);
    if (!version) {
      throw new BudgetAttachmentNotFoundError();
    }

    const today = await this.facts.today(new Date());
    const isFinance = actor.roles.includes('FINANCE');
    const isDecider = await this.facts.isSpendingApprover(actor.employeeId);
    const headedCostCenterId = await this.facts.headedCostCenter(actor.employeeId, today);

    const view = budgetRecordView({
      isFinance,
      isDecider,
      headedCostCenterId,
      recordCostCenterId: version.costCenterId,
      versionSentAt: version.sentAt,
    });

    if (view === 'NONE') {
      throw new BudgetAttachmentNotFoundError();
    }

    if (view === 'AS_LAST_SENT') {
      if (!version.sentAt || !record.attachedAt) {
        throw new BudgetAttachmentNotFoundError();
      }
      if (record.attachedAt.getTime() > version.sentAt.getTime()) {
        throw new BudgetAttachmentNotFoundError();
      }
      if (record.removedAt && record.removedAt.getTime() <= version.sentAt.getTime()) {
        throw new BudgetAttachmentNotFoundError();
      }
    }
  }
}
