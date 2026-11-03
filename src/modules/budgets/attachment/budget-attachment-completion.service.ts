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
import {
  FINAL_SCOPE,
  formatForContentType,
  MAX_RECORD_ATTACHMENTS,
  UPLOAD_ABANDONED_AFTER_MS,
} from './budget-attachment.policy';
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

  /**
   * Looks at what the storage holds for the file: if it is what was declared, those bytes are copied to the key the file
   * is kept under and the file is kept (a proposal file waits for its head, a version file is attached); if not, the
   * object is deleted and the file is quarantined. An object that has not arrived is not a refusal: the file keeps
   * waiting. Same order as `DocumentService.complete`: the database first under the row lock, the upload last.
   */
  async complete(actor: AuthenticatedPrincipal, attachmentId: string): Promise<BudgetAttachmentWire> {
    const record = await this.attachments.find(attachmentId);
    if (!record || record.uploadedByEmployeeId !== actor.employeeId) {
      throw new BudgetAttachmentNotFoundError();
    }

    this.assertTargetRole(actor, record);
    if (record.status !== 'AWAITING_UPLOAD') {
      throw new BudgetAttachmentNotAwaitingUploadError();
    }
    if (Date.now() - record.createdAt.getTime() >= UPLOAD_ABANDONED_AFTER_MS) {
      // Given up by this call, or changed first by a simultaneous one: then the row as it is now answers.
      if (await this.expireUpload(actor, record)) throw new BudgetAttachmentUploadExpiredError();
      throw await this.answerFromRow(actor, record.id);
    }

    const result = await this.inspect(record);
    if (result.outcome === 'MISSING') {
      // Never came, or kept (or given up) by a simultaneous call that deletes it only after its commit.
      throw await this.answerFromRow(actor, record.id);
    }
    if (result.outcome === 'MISMATCH') {
      // The inspection already deleted the object; the row says so, unless a simultaneous call changed it first.
      if (await this.quarantine(actor, record)) throw new BudgetAttachmentUploadMismatchError();
      throw await this.answerFromRow(actor, record.id);
    }

    const finalObjectKey = result.finalObjectKey;
    // The database first, the upload last: a commit that fails takes its own copy back and keeps the upload.
    const commit =
      record.target === 'PROPOSAL'
        ? this.completeProposal(actor, record, finalObjectKey)
        : this.completeVersion(actor, record, finalObjectKey);
    await commit.catch(async (error: unknown) => {
      await this.withdrawCopy(record.id, finalObjectKey);
      throw error;
    });
    // Known committed: the upload is no more use; a failed delete leaves it to the bucket's lifecycle rule.
    await this.deleteQuietly(record.objectKey);

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

  private async inspect(record: BudgetAttachmentRecord) {
    const format = formatForContentType(record.contentType);
    if (!format) {
      throw new BudgetAttachmentUploadMismatchError();
    }

    return this.inspection.inspect({
      pendingKey: record.objectKey,
      declared: {
        contentType: record.contentType,
        sizeBytes: record.sizeBytes,
      },
      accepts: (prefix, options) => matchesFormat(format, prefix, options),
      finalScope: FINAL_SCOPE,
    });
  }

  /**
   * The answer for a file a simultaneous call may have changed, from its row read again: still awaiting its upload
   * means pending, given up means expired, otherwise done means not awaiting.
   */
  private async answerFromRow(actor: AuthenticatedPrincipal, id: string): Promise<Error> {
    const row = await this.attachments.find(id);
    if (!row || row.uploadedByEmployeeId !== actor.employeeId) return new BudgetAttachmentNotFoundError();
    if (row.status === 'AWAITING_UPLOAD') return new BudgetAttachmentUploadPendingError();

    return row.status === 'EXPIRED'
      ? new BudgetAttachmentUploadExpiredError()
      : new BudgetAttachmentNotAwaitingUploadError();
  }

  private async completeProposal(
    actor: AuthenticatedPrincipal,
    record: BudgetAttachmentRecord,
    finalObjectKey: string,
  ): Promise<void> {
    await this.runner.run(async (tx) => {
      const locked = await this.attachments.lock(tx, record.id);
      if (!locked) throw new BudgetAttachmentNotFoundError();
      if (locked.status !== 'AWAITING_UPLOAD') throw new BudgetAttachmentNotAwaitingUploadError();

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
    await this.runner.run(async (tx) => {
      const version = await this.access.lockEditable(tx, record.versionId!, fiscalStart);
      const locked = await this.attachments.lock(tx, record.id);
      if (!locked) throw new BudgetAttachmentNotFoundError();
      if (locked.status !== 'AWAITING_UPLOAD') throw new BudgetAttachmentNotAwaitingUploadError();

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
        budgetAuditEvent(actor, version.organizationId, 'BUDGET_ATTACHMENT.ATTACHED', 'BUDGET_ATTACHMENT', record.id, {
          target: 'VERSION',
          versionId: version.id,
        }),
      );
    });
  }

  /** The file quarantined, if it is still awaiting its upload when its row is locked; false when something else got there first. */
  private async quarantine(actor: AuthenticatedPrincipal, record: BudgetAttachmentRecord): Promise<boolean> {
    return this.runner.run(async (tx) => {
      const locked = await this.attachments.lock(tx, record.id);
      if (!locked || locked.status !== 'AWAITING_UPLOAD') return false;

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

      return true;
    });
  }

  /** The file given up, if it is still awaiting its upload when its row is locked; the object goes after the commit. */
  private async expireUpload(actor: AuthenticatedPrincipal, record: BudgetAttachmentRecord): Promise<boolean> {
    const done = await this.runner.run(async (tx) => {
      const locked = await this.attachments.lock(tx, record.id);
      if (!locked || locked.status !== 'AWAITING_UPLOAD') return false;

      await this.attachments.markExpired(tx, record.id);
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, record.organizationId, 'BUDGET_ATTACHMENT.EXPIRED', 'BUDGET_ATTACHMENT', record.id, {
          target: record.target,
        }),
      );

      return true;
    });
    if (done) await this.deleteQuietly(record.objectKey);

    return done;
  }

  /** The copy of a failed commit goes unless the row names it (the answer was lost); unreadable, it stays: never a kept file lost. */
  private async withdrawCopy(id: string, finalObjectKey: string): Promise<void> {
    const row = await this.attachments.find(id).catch(() => undefined);
    if (row !== undefined && row?.finalObjectKey !== finalObjectKey) await this.deleteQuietly(finalObjectKey);
  }

  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      // Best effort: the bucket's lifecycle rule takes what stays.
    }
  }
}
