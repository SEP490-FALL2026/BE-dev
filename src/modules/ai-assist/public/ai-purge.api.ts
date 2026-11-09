import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { addDays, toDateColumn } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { contentsPurgedEvent } from '../invocation/invocation-audit-event.mapper';
import { AiInvocationContentRepo } from '../invocation/invocation-content.repo';
import { AiPurgeRefusedError } from './ai-purge.errors';
import type { AiPurgeCommand, AiPurgeResult } from './ai-purge.types';

/**
 * The retention of what was said to the AI (`US-15-05`): deletes the contents (`ai_invocation_contents`) created on or before the end
 * of a day, UTC, and keeps every call (`ai_invocations`); the content of a call still live (PENDING, RUNNING) is never in scope, so a run in progress never loses the row it writes into. A COMPLETED call whose content goes becomes STALE, so it no longer holds the place of its queue revision. A dry run only counts. An applied purge deletes and writes
 * `AI_INVOCATION.PURGED` (the count and the cut-off, never a content) in one transaction, so it is never deleted unrecorded; one that
 * finds nothing writes nothing. There is no principal: the command is the operator's, and the Audit Trail says so (`OPERATOR`).
 */
@Injectable()
export class AiPurgeApi {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly contents: AiInvocationContentRepo,
    private readonly organizations: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /** Throws AiPurgeRefusedError (nothing was written) for an apply with no operator, or with no organization to record it under. */
  async purge(command: AiPurgeCommand): Promise<AiPurgeResult> {
    // Created on or before the end of the day: before the start of the next one.
    const before = toDateColumn(addDays(command.through, 1));
    if (!command.apply) {
      return {
        mode: 'DRY_RUN',
        through: command.through,
        contentCount: await this.contents.countCreatedBefore(before),
      };
    }
    const operator = command.operator;
    if (operator === null) throw new AiPurgeRefusedError('OPERATOR_REQUIRED');

    const deleted = await this.runner.run(async (tx) => {
      const organization = await this.organizations.getOrganization(tx);
      if (organization === null) throw new AiPurgeRefusedError('NOT_INSTALLED');
      const count = await this.contents.deleteCreatedBefore(tx, before);
      if (count > 0) {
        await this.audit.record(
          tx,
          contentsPurgedEvent(
            organization.id,
            { deletedCount: count, through: command.through },
            operator,
            randomUUID(),
          ),
        );
      }

      return count;
    });

    return { mode: 'APPLIED', through: command.through, contentCount: deleted };
  }
}
