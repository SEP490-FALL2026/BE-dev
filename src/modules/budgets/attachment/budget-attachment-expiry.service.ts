import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { AuditApi } from '../../audit/public/audit.api';
import { expiresAt } from './budget-attachment.policy';
import { BudgetAttachmentRepo } from './budget-attachment.repo';
import type { BudgetAttachmentRecord } from './budget-attachment.types';

@Injectable()
export class BudgetAttachmentExpiryService {
  private readonly logger = new Logger(BudgetAttachmentExpiryService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly attachments: BudgetAttachmentRepo,
    private readonly audit: AuditApi,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async expire(now: Date, limit = 50): Promise<{ expired: number }> {
    const candidates = await this.attachments.findExpiredCandidates(now, limit);
    let expiredCount = 0;

    for (const candidate of candidates) {
      try {
        const expired = await this.expireOne(candidate, now);
        if (expired) {
          expiredCount++;
        }
      } catch (error) {
        this.logger.error(`Attachment sweep step ${candidate.id} failed: ${describeForOperator(error)}`);
      }
    }

    return { expired: expiredCount };
  }

  private async expireOne(candidate: BudgetAttachmentRecord, now: Date): Promise<boolean> {
    let deletedKey: string | null = null;

    const didExpire = await this.runner.run(async (tx) => {
      const locked = await this.attachments.lock(tx, candidate.id);
      if (!locked) return false;
      if (locked.status !== 'AWAITING_UPLOAD' && locked.status !== 'UPLOADED') {
        return false;
      }

      if (now.getTime() < expiresAt(locked.status, locked.createdAt).getTime()) {
        return false;
      }

      await this.attachments.markExpired(tx, locked.id);
      await this.audit.record(tx, {
        organizationId: locked.organizationId,
        actorKind: 'SYSTEM',
        actorAppUserId: null,
        actorRoles: [],
        action: 'BUDGET_ATTACHMENT.EXPIRED',
        resourceType: 'BUDGET_ATTACHMENT',
        resourceId: locked.id,
        before: { status: locked.status },
        after: { status: 'EXPIRED', target: locked.target },
        correlationId: `budget-attachment-expiry:${locked.id}`,
      });

      deletedKey = locked.finalObjectKey ?? locked.objectKey;
      return true;
    });

    if (didExpire && deletedKey) {
      await this.deleteFromStorage(deletedKey);
    }

    return didExpire;
  }

  private async deleteFromStorage(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      // Best effort discard of stored object
    }
  }
}
