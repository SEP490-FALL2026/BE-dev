import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import { maxAttempts as maxAttemptsFor } from '../failure.policy';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';

/**
 * The IT task that extends a right whose renewal was approved (`BR-MF1-08d`): approval does not extend the right by itself, the IT Admin
 * extends it with the vendor and completes the task, and only then is the record that follows the old one written (by the module of
 * requests, through `GrantRequestGate.reportExtended`). The task is manual, on the old record, for the IT Admin in charge of the holder's
 * department today, and answers for the request like a grant. Opened in the transaction of the approval, under the lock of the seat.
 */
@Injectable()
export class ProvisioningExtensionService {
  constructor(
    private readonly tasks: ProvisioningTaskRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
    private readonly audit: AuditApi,
  ) {}

  /** Opens the task on the seat; the caller has judged the seat under its lock (open, personal, not being revoked). */
  async open(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { assignmentId: string; holderEmployeeId: string; requestId: string; now: Date },
  ): Promise<{ taskId: string }> {
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A right was extended before installation');
    const today = await this.organizationReads.businessToday(input.now, tx);
    const inCharge = await this.organizationReads.getItAdminInCharge(input.holderEmployeeId, today);
    // The most tries are fixed here, as for a grant: a parameter changed later reaches only the tasks made after it.
    const maxAttempts = maxAttemptsFor(Number(await this.parameters.getValue('PROVISIONING_RETRY_COUNT')));
    const task = await this.tasks.insert(tx, {
      kind: 'EXTEND',
      organizationId: organization.id,
      assignmentId: input.assignmentId,
      channel: 'MANUAL',
      requestId: input.requestId,
      defaultResponsibleEmployeeId: inCharge?.itAdminEmployeeId ?? null,
      createdByAppUserId: actor.appUserId,
      maxAttempts,
    });
    await this.audit.record(
      tx,
      licensingAuditEvent(actor, organization.id, 'PROVISIONING_TASK.CREATED', 'ProvisioningTask', task.id, null, {
        kind: 'EXTEND',
        channel: 'MANUAL',
        assignmentId: input.assignmentId,
        requestId: input.requestId,
        defaultResponsibleEmployeeId: inCharge?.itAdminEmployeeId ?? null,
      }),
    );

    return { taskId: task.id };
  }
}
