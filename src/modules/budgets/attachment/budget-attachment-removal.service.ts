import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { VersionAccessService } from '../version/version-access.service';
import { VersionHistoryService } from '../version/version-history.service';
import type { BudgetAttachmentWire } from './budget-attachment.dto';
import { BudgetAttachmentAlreadyRemovedError, BudgetAttachmentNotFoundError } from './budget-attachment.errors';
import { toBudgetAttachmentWire } from './budget-attachment.mapper';
import { BudgetAttachmentRepo } from './budget-attachment.repo';
import type { BudgetAttachmentRecord } from './budget-attachment.types';

@Injectable()
export class BudgetAttachmentRemovalService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly attachments: BudgetAttachmentRepo,
    private readonly access: VersionAccessService,
    private readonly history: VersionHistoryService,
    private readonly audit: AuditApi,
    private readonly facts: BudgetFactsService,
  ) {}

  async remove(actor: AuthenticatedPrincipal, versionId: string, attachmentId: string): Promise<BudgetAttachmentWire> {
    const fiscalStart = await this.access.begin(actor);

    const updated = await this.runner.run(async (tx) => {
      const version = await this.access.lockEditable(tx, versionId, fiscalStart);
      const record = await this.attachments.lock(tx, attachmentId);

      this.assertValidForRemoval(record, versionId);

      const removedAt = new Date();
      await this.attachments.markRemoved(tx, record.id, actor.employeeId, removedAt);

      await this.history.attachmentRemoved(tx, actor, version, {
        attachmentId: record.id,
        fileName: record.fileName,
        contentType: record.contentType,
        sizeBytes: record.sizeBytes,
      });

      await this.audit.record(
        tx,
        budgetAuditEvent(actor, version.organizationId, 'BUDGET_ATTACHMENT.REMOVED', 'BUDGET_ATTACHMENT', record.id, {
          target: 'VERSION',
          versionId: version.id,
        }),
      );

      return {
        ...record,
        status: 'REMOVED' as const,
        removedAt,
        removedByEmployeeId: actor.employeeId,
      };
    });

    const people = await this.facts.people([updated.uploadedByEmployeeId, actor.employeeId]);
    const uploader = people.get(updated.uploadedByEmployeeId) ?? null;
    const remover = people.get(actor.employeeId) ?? null;

    return toBudgetAttachmentWire(updated, uploader, remover);
  }

  private assertValidForRemoval(
    record: BudgetAttachmentRecord | null,
    versionId: string,
  ): asserts record is BudgetAttachmentRecord {
    if (
      !record ||
      record.versionId !== versionId ||
      record.status === 'AWAITING_UPLOAD' ||
      record.status === 'QUARANTINED' ||
      record.status === 'EXPIRED' ||
      record.status === 'DISCARDED'
    ) {
      throw new BudgetAttachmentNotFoundError();
    }

    if (record.status === 'REMOVED') {
      throw new BudgetAttachmentAlreadyRemovedError();
    }

    if (record.status !== 'ATTACHED') {
      throw new BudgetAttachmentNotFoundError();
    }
  }
}
