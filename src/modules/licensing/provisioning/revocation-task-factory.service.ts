import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import type { RevocationSource } from '../public/licensing.types';
import { maxAttempts as maxAttemptsFor } from './failure.policy';
import type { ProvisioningTaskRecord } from './provisioning-task.types';
import { ProvisioningTaskRepo } from './provisioning-task.repo';

/** The task a seat did not have yet: manual, queued for the IT Admin in charge of the holder's department today (`QĐ-64a`). */
@Injectable()
export class RevocationTaskFactory {
  constructor(
    private readonly tasks: ProvisioningTaskRepo,
    private readonly organization: OrganizationApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  async create(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      assignment: { id: string; employeeId: string };
      source: RevocationSource;
      now: Date;
    },
  ): Promise<ProvisioningTaskRecord> {
    const today = await this.organization.businessToday(input.now, tx);
    const inCharge = await this.organization.getItAdminInCharge(input.assignment.employeeId, today);
    // The most tries are fixed here, as for a grant: a parameter changed later reaches only the tasks made after it.
    const maxAttempts = maxAttemptsFor(Number(await this.parameters.getValue('PROVISIONING_RETRY_COUNT')));

    return this.tasks.insertRevocation(tx, {
      organizationId: input.organizationId,
      assignmentId: input.assignment.id,
      source: input.source,
      defaultResponsibleEmployeeId: inCharge?.itAdminEmployeeId ?? null,
      createdByAppUserId: actor.appUserId,
      maxAttempts,
    });
  }
}
