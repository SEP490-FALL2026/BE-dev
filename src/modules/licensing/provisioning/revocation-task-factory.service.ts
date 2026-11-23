import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { isSystemActor, type RevocationSource, type SystemActor } from '../public/licensing.types';
import { maxAttempts as maxAttemptsFor } from './failure.policy';
import type { ProvisioningTaskRecord } from './provisioning-task.types';
import { ProvisioningTaskRepo } from './provisioning-task.repo';

/** The task a seat did not have yet: manual, queued for the IT Admin in charge of the holder's department today (`QĐ-64a`). */
@Injectable()
export class RevocationTaskFactory {
  constructor(
    private readonly tasks: ProvisioningTaskRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  async create(
    tx: DbTx,
    actor: AuthenticatedPrincipal | SystemActor,
    input: {
      organizationId: string;
      assignment: { id: string; employeeId: string };
      source: RevocationSource;
      now: Date;
    },
  ): Promise<ProvisioningTaskRecord> {
    const today = await this.organizationReads.businessToday(input.now, tx);
    const deptId = (await this.organizationReads.workDepartmentsOf([input.assignment.employeeId], today, tx)).get(
      input.assignment.employeeId,
    );
    const defaultResponsibleEmployeeId = deptId
      ? ((
          await this.organizationReads.itAdminsActingFor(
            [deptId],
            (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
            tx,
          )
        ).get(deptId)?.defaultAssignee ?? null)
      : null;
    // The most tries are fixed here, as for a grant: a parameter changed later reaches only the tasks made after it.
    const maxAttempts = maxAttemptsFor(Number(await this.parameters.getValue('PROVISIONING_RETRY_COUNT', tx)));

    return this.tasks.insertRevocation(tx, {
      organizationId: input.organizationId,
      assignmentId: input.assignment.id,
      source: input.source,
      defaultResponsibleEmployeeId,
      creator: isSystemActor(actor) ? { system: true } : { appUserId: actor.appUserId },
      maxAttempts,
    });
  }
}
