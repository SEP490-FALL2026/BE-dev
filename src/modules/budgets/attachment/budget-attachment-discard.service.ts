import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import type { BudgetAttachmentWire } from './budget-attachment.dto';
import { BudgetAttachmentNotDiscardableError, BudgetAttachmentNotFoundError } from './budget-attachment.errors';
import { toBudgetAttachmentWire } from './budget-attachment.mapper';
import { BudgetAttachmentRepo } from './budget-attachment.repo';

@Injectable()
export class BudgetAttachmentDiscardService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly attachments: BudgetAttachmentRepo,
    private readonly audit: AuditApi,
    private readonly facts: BudgetFactsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async discard(actor: AuthenticatedPrincipal, attachmentId: string): Promise<BudgetAttachmentWire> {
    const record = await this.attachments.find(attachmentId);
    if (!record || record.uploadedByEmployeeId !== actor.employeeId) {
      throw new BudgetAttachmentNotFoundError();
    }

    if (record.status !== 'AWAITING_UPLOAD' && record.status !== 'UPLOADED') {
      throw new BudgetAttachmentNotDiscardableError(record.status);
    }

    const discarded = await this.runner.run(async (tx) => {
      const locked = await this.attachments.lock(tx, record.id);
      if (!locked || locked.uploadedByEmployeeId !== actor.employeeId) {
        throw new BudgetAttachmentNotFoundError();
      }

      if (locked.status !== 'AWAITING_UPLOAD' && locked.status !== 'UPLOADED') {
        throw new BudgetAttachmentNotDiscardableError(locked.status);
      }

      await this.attachments.markDiscarded(tx, locked.id);
      await this.audit.record(
        tx,
        budgetAuditEvent(
          actor,
          locked.organizationId,
          'BUDGET_ATTACHMENT.DISCARDED',
          'BUDGET_ATTACHMENT',
          locked.id,
          {},
          { status: locked.status },
        ),
      );

      return locked;
    });

    // After the commit: the upload and the kept copy (if the upload was already looked at) are no more use.
    await this.deleteFromStorage(discarded.objectKey);
    if (discarded.finalObjectKey) await this.deleteFromStorage(discarded.finalObjectKey);

    const updated = await this.attachments.find(record.id);
    const people = await this.facts.people([actor.employeeId]);
    const uploader = people.get(actor.employeeId) ?? null;

    return toBudgetAttachmentWire(updated ?? { ...record, status: 'DISCARDED' }, uploader);
  }

  private async deleteFromStorage(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      // Best effort discard of stored object
    }
  }
}
