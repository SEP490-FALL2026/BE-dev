import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import { matchesFormat } from '../../../infrastructure/object-storage/file-signature';
import { UploadInspection } from '../../../infrastructure/object-storage/upload-inspection';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { VersionAccessService } from '../version/version-access.service';
import { VersionHistoryService } from '../version/version-history.service';
import type { BudgetAttachmentWire } from './budget-attachment.dto';
import {
  BudgetAttachmentForbiddenRoleError,
  BudgetAttachmentLimitReachedError,
  BudgetAttachmentNotAwaitingUploadError,
  BudgetAttachmentNotFoundError,
  BudgetAttachmentUploadExpiredError,
  BudgetAttachmentUploadMismatchError,
  BudgetAttachmentUploadPendingError,
} from './budget-attachment.errors';
import { toBudgetAttachmentWire } from './budget-attachment.mapper';
import { formatForContentType, MAX_RECORD_ATTACHMENTS, UPLOAD_ABANDONED_AFTER_MS } from './budget-attachment.policy';
import { BudgetAttachmentRepo } from './budget-attachment.repo';
import type { BudgetAttachmentRecord } from './budget-attachment.types';

@Injectable()
export class BudgetAttachmentCompletionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly attachments: BudgetAttachmentRepo,
    private readonly access: VersionAccessService,
    private readonly history: VersionHistoryService,
    private readonly inspection: UploadInspection,
    private readonly audit: AuditApi,
    private readonly facts: BudgetFactsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async complete(actor: AuthenticatedPrincipal, attachmentId: string): Promise<BudgetAttachmentWire> {
    const record = await this.attachments.find(attachmentId);
    if (!record || record.uploadedByEmployeeId !== actor.employeeId) {
      throw new BudgetAttachmentNotFoundError();
    }

    this.assertTargetRole(actor, record);
    await this.assertNotExpired(actor, record);

    if (record.status !== 'AWAITING_UPLOAD') {
      throw new BudgetAttachmentNotAwaitingUploadError();
    }

    const finalObjectKey = await this.inspectUpload(actor, record);

    if (record.target === 'PROPOSAL') {
      await this.completeProposal(actor, record, finalObjectKey);
    } else {
      await this.completeVersion(actor, record, finalObjectKey);
    }

    const updated = await this.attachments.find(record.id);
    const people = await this.facts.people([actor.employeeId]);
    const uploader = people.get(actor.employeeId) ?? null;

    return toBudgetAttachmentWire(updated ?? record, uploader);
  }

  private assertTargetRole(actor: AuthenticatedPrincipal, record: BudgetAttachmentRecord): void {
    if (record.target === 'VERSION' && !actor.roles.includes('FINANCE')) {
      throw new BudgetAttachmentForbiddenRoleError();
    }
    if (record.target === 'PROPOSAL' && !actor.roles.includes('MANAGER')) {
      throw new BudgetAttachmentForbiddenRoleError();
    }
  }

  private async assertNotExpired(actor: AuthenticatedPrincipal, record: BudgetAttachmentRecord): Promise<void> {
    const now = new Date();
    const isAbandoned =
      record.status === 'EXPIRED' ||
      (record.status === 'AWAITING_UPLOAD' && record.createdAt.getTime() + UPLOAD_ABANDONED_AFTER_MS <= now.getTime());

    if (isAbandoned) {
      if (record.status === 'AWAITING_UPLOAD') {
        await this.expireUpload(actor, record);
      }
      throw new BudgetAttachmentUploadExpiredError();
    }
  }

  private async inspectUpload(actor: AuthenticatedPrincipal, record: BudgetAttachmentRecord): Promise<string> {
    const format = formatForContentType(record.contentType);
    if (!format) {
      throw new BudgetAttachmentUploadMismatchError();
    }

    const result = await this.inspection.inspect({
      pendingKey: record.objectKey,
      declared: {
        contentType: record.contentType,
        sizeBytes: record.sizeBytes,
      },
      accepts: (prefix, options) => matchesFormat(format, prefix, options),
      finalScope: 'documents',
    });

    if (result.outcome === 'MISSING') {
      throw new BudgetAttachmentUploadPendingError();
    }
    if (result.outcome === 'MISMATCH') {
      await this.quarantine(actor, record);
      throw new BudgetAttachmentUploadMismatchError();
    }

    return result.finalObjectKey;
  }

  private async completeProposal(
    actor: AuthenticatedPrincipal,
    record: BudgetAttachmentRecord,
    finalObjectKey: string,
  ): Promise<void> {
    await this.runner.run(async (tx) => {
      const locked = await this.attachments.lock(tx, record.id);
      if (!locked || locked.status !== 'AWAITING_UPLOAD') {
        throw new BudgetAttachmentNotAwaitingUploadError();
      }
      await this.attachments.markUploaded(tx, record.id, finalObjectKey);
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, record.organizationId, 'BUDGET_ATTACHMENT.UPLOADED', 'BUDGET_ATTACHMENT', record.id, {
          target: 'PROPOSAL',
        }),
      );
    });
  }

  private async completeVersion(
    actor: AuthenticatedPrincipal,
    record: BudgetAttachmentRecord,
    finalObjectKey: string,
  ): Promise<void> {
    const fiscalStart = await this.access.begin(actor);
    try {
      await this.runner.run(async (tx) => {
        const version = await this.access.lockEditable(tx, record.versionId!, fiscalStart);
        const locked = await this.attachments.lock(tx, record.id);
        if (!locked || locked.status !== 'AWAITING_UPLOAD') {
          throw new BudgetAttachmentNotAwaitingUploadError();
        }
        const attachedCount = await this.attachments.countAttachedByVersion(tx, record.versionId!);
        if (attachedCount >= MAX_RECORD_ATTACHMENTS) {
          throw new BudgetAttachmentLimitReachedError(MAX_RECORD_ATTACHMENTS);
        }

        const attachedAt = new Date();
        await this.attachments.markAttachedVersion(tx, record.id, finalObjectKey, attachedAt);

        await this.history.attachmentAdded(tx, actor, version, {
          attachmentId: record.id,
          fileName: record.fileName,
          contentType: record.contentType,
          sizeBytes: record.sizeBytes,
        });

        await this.audit.record(
          tx,
          budgetAuditEvent(
            actor,
            version.organizationId,
            'BUDGET_ATTACHMENT.ATTACHED',
            'BUDGET_ATTACHMENT',
            record.id,
            {
              target: 'VERSION',
              versionId: version.id,
            },
          ),
        );
      });
    } catch (error) {
      await this.withdrawCopy(finalObjectKey);
      throw error;
    }
  }

  private async quarantine(actor: AuthenticatedPrincipal, record: BudgetAttachmentRecord): Promise<void> {
    await this.runner.run(async (tx) => {
      await this.attachments.markQuarantined(tx, record.id);
      await this.audit.record(
        tx,
        budgetAuditEvent(
          actor,
          record.organizationId,
          'BUDGET_ATTACHMENT.QUARANTINED',
          'BUDGET_ATTACHMENT',
          record.id,
          {
            target: record.target,
          },
        ),
      );
    });
  }

  private async expireUpload(actor: AuthenticatedPrincipal, record: BudgetAttachmentRecord): Promise<void> {
    await this.runner.run(async (tx) => {
      await this.attachments.markExpired(tx, record.id);
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, record.organizationId, 'BUDGET_ATTACHMENT.EXPIRED', 'BUDGET_ATTACHMENT', record.id, {
          target: record.target,
        }),
      );
    });
  }

  private async withdrawCopy(finalObjectKey: string): Promise<void> {
    try {
      await this.storage.delete(finalObjectKey);
    } catch {
      // Best effort discard of copied object
    }
  }
}
