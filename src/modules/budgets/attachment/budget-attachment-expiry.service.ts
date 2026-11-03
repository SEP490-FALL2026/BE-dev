import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetAttachmentRepo } from './budget-attachment.repo';

@Injectable()
export class BudgetAttachmentExpiryService {
  private readonly logger = new Logger(BudgetAttachmentExpiryService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly attachments: BudgetAttachmentRepo,
    private readonly audit: AuditApi,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  /**
   * Gives up the files whose upload never came (24 hours) or that no proposal took (7 days), at most `limit`: each one in
   * its own transaction, picked and locked `FOR UPDATE SKIP LOCKED` so a file a proposal send holds is left to it and
   * the sweep never waits; the object goes after the commit. Safe to run often and from several instances.
   */
  async expire(now: Date, limit = 100): Promise<{ expired: number }> {
    const failed: string[] = [];
    let expiredCount = 0;

    while (expiredCount + failed.length < limit) {
      const picked = { id: null as string | null };
      try {
        const done = await this.expireNext(now, failed, picked);
        if (done === null) break;
        expiredCount += 1;
        for (const key of done.keys) await this.deleteFromStorage(key);
      } catch (error) {
        this.logger.error(
          `Attachment sweep step ${picked.id ?? '(none picked)'} failed: ${describeForOperator(error)}`,
        );
        // The failed row rolled back and is still a candidate: keep it out of the rest of this pass, or stop.
        if (picked.id === null) break;
        failed.push(picked.id);
      }
    }

    return { expired: expiredCount };
  }

  private async expireNext(
    now: Date,
    excluded: readonly string[],
    picked: { id: string | null },
  ): Promise<{ keys: string[] } | null> {
    return this.runner.run(async (tx) => {
      const locked = await this.attachments.lockNextExpired(tx, now, excluded);
      if (!locked) return null;
      picked.id = locked.id;

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

      return { keys: [locked.objectKey, ...(locked.finalObjectKey ? [locked.finalObjectKey] : [])] };
    });
  }

  private async deleteFromStorage(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      // Best effort discard of stored object
    }
  }
}
