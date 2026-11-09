import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  ProvisioningTaskNotConnectorError,
  ProvisioningTaskNotFoundError,
  ProvisioningTaskStateError,
} from '../public/licensing.errors';
import type { ProvisioningFailureKind } from '../public/licensing.types';
import { classifyFailure, connectorErrorDetail } from './failure.policy';
import { ProvisioningTaskRepo } from './provisioning-task.repo';

/** What the connector is told of the failure it reported. */
export interface FailureRecorded {
  status: 'RETRY_SCHEDULED' | 'FAILED';
  attempts: number;
  nextRetryAt: Date | null;
}

/**
 * Where a failure reported by the connector goes (`US-07-04` AC-1→AC-4, AC-7): a temporary one waits for its next try with
 * a longer wait each time, while retries are left (`PROVISIONING_RETRY_COUNT`); a permanent one, one of authentication or
 * of quota, and a temporary one with no retry left go to the failure queue for an IT Admin to decide. The connector itself
 * does not exist yet (`US-07-03`): this is the entry it will call, and the tests call it in its place. The system is the
 * actor; nothing here retries, hands off or closes a task.
 */
@Injectable()
export class ProvisioningFailureService {
  constructor(
    private readonly repo: ProvisioningTaskRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Records one failed try of a connector task. `detail` is the technical error for the IT team; it stays on the task and
   * never enters the audit event. Throws ProvisioningTaskNotFoundError, ProvisioningTaskNotConnectorError and
   * ProvisioningTaskStateError.
   */
  async recordFailure(input: {
    taskId: string;
    kind: ProvisioningFailureKind;
    detail: string;
    now?: Date;
  }): Promise<FailureRecorded> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A failure was recorded before installation');
    const now = input.now ?? new Date();
    const detail = connectorErrorDetail(input.detail, input.kind);

    return this.runner.run(async (tx) => {
      const task = await this.repo.lock(tx, input.taskId);
      if (!task) throw new ProvisioningTaskNotFoundError();
      if (task.channel !== 'CONNECTOR') throw new ProvisioningTaskNotConnectorError();
      if (task.status !== 'QUEUED' && task.status !== 'RETRY_SCHEDULED' && task.status !== 'IN_PROGRESS') {
        throw new ProvisioningTaskStateError('NOT_RUNNING');
      }

      const attempts = task.attempts + 1;
      // The retries are those the task was made with, not those the configuration allows today (US-01-04 AC-13).
      const outcome = classifyFailure({ kind: input.kind, attempts, retryCount: task.maxAttempts - 1 });
      const nextRetryAt =
        outcome.status === 'RETRY_SCHEDULED' ? new Date(now.getTime() + outcome.delayMinutes * 60_000) : null;
      await this.repo.markFailureRecorded(
        tx,
        task.id,
        outcome.status === 'RETRY_SCHEDULED' && nextRetryAt
          ? { next: 'RETRY_SCHEDULED', attempts, lastError: detail, nextRetryAt }
          : { next: 'FAILED', kind: input.kind, attempts, lastError: detail, reason: detail, now },
      );
      await this.audit.record(tx, {
        organizationId: organization.id,
        actorKind: 'SYSTEM',
        action: 'PROVISIONING_TASK.FAILURE_RECORDED',
        resourceType: 'ProvisioningTask',
        resourceId: task.id,
        before: { status: task.status, attempts: task.attempts },
        after: {
          status: outcome.status,
          failureKind: input.kind,
          attempts,
          retriesExhausted: outcome.status === 'FAILED' && outcome.retriesExhausted,
          requestId: task.requestId,
          taskKind: task.kind,
        },
        correlationId: `provisioning-task:${task.id}`,
        occurredAt: now,
      });

      return { status: outcome.status, attempts, nextRetryAt };
    });
  }
}
