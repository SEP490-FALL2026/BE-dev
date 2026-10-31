import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetNotifierService } from '../budget/budget-notifier.service';
import { budgetAuditEvent } from '../budget/budget-support.service';
import type { ProposalRecord } from '../budget/proposal.repo';
import type { VersionRecord } from '../budget/version.repo';
import { VersionHistoryService } from './version-history.service';

/**
 * What a version leaves behind when Finance makes, edits or sends it (`US-06-09`): the entry of its history, the Audit Trail, and the
 * notice to the people who wait on it, all in the transaction of the write.
 */
@Injectable()
export class VersionTrail {
  constructor(
    private readonly audit: AuditApi,
    private readonly history: VersionHistoryService,
    private readonly notifier: BudgetNotifierService,
  ) {}

  async created(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    made: { id: string; organizationId: string; kind: 'INITIAL' | 'REVISION'; costCenterId: string; year: number },
  ): Promise<void> {
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, made.organizationId, 'BUDGET_VERSION.CREATED', 'BUDGET_VERSION', made.id, {
        kind: made.kind,
        costCenterId: made.costCenterId,
        year: made.year,
      }),
    );
  }

  async updated(tx: DbTx, actor: AuthenticatedPrincipal, version: VersionRecord, edited: VersionRecord): Promise<void> {
    const change = await this.history.figuresEdited(tx, actor, version, version, edited);
    await this.audit.record(
      tx,
      budgetAuditEvent(
        actor,
        version.organizationId,
        'BUDGET_VERSION.UPDATED',
        'BUDGET_VERSION',
        version.id,
        { ...(change?.after ?? {}) },
        { ...(change?.before ?? {}) },
      ),
    );
  }

  async sent(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    version: VersionRecord,
    sent: { record: VersionRecord; proposal: Pick<ProposalRecord, 'submittedByEmployeeId'> | null },
  ): Promise<void> {
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, version.organizationId, 'BUDGET_VERSION.SENT', 'BUDGET_VERSION', version.id, {
        costCenterId: version.costCenterId,
        year: version.year,
        kind: version.kind,
        totalMinor: version.totalMinor.toString(),
      }),
    );
    await this.notifier.versionSent(tx, sent.record, sent.proposal?.submittedByEmployeeId ?? null);
  }
}
