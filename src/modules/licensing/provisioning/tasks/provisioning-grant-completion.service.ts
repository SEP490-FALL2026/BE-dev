import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { AssignmentService } from '../../assignment/assignment.service';
import { LicenseKeyAssignmentService } from '../../license-key/license-key-assignment.service';
import { GrantRequestGateHook } from '../../public/licensing.extension-points';
import { SharedPoolService } from '../../shared-pool/shared-pool.service';
import { assertKeyFits } from '../provisioning.policy';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';

/**
 * What the completion of the task of a grant writes, in the transaction that holds the task (`US-07-01`, `BR-MF1-09`): the task is
 * completed, a K4 seat is given the free key of the store the IT Admin names (the subscription, then the key, locked in that order), the day
 * the right begins is recorded (`BR-MF1-06a`), the request is told the outcome with whether the seat came from the pool, and a grant taken
 * from the pool with nothing bought records the cost it avoided once (`BR-MF1-09c`). Throws ProvisioningKeyError, LicenseKeyNotFoundError,
 * LicenseKeyStateError and whatever the request gate throws.
 */
@Injectable()
export class ProvisioningGrantCompletion {
  constructor(
    private readonly repo: ProvisioningTaskRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly gate: GrantRequestGateHook,
    private readonly sharedPool: SharedPoolService,
    private readonly assignments: AssignmentService,
    private readonly keys: LicenseKeyAssignmentService,
  ) {}

  async write(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    context: { task: ProvisioningTaskRecord; now: Date; organizationId: string },
    input: { evidence: string; licenseKeyId?: string | undefined },
  ): Promise<void> {
    const { task, now, organizationId } = context;
    const provisioningType = await this.sharedPool.provisioningTypeOf(tx, task.assignment.planId);
    assertKeyFits(provisioningType, input.licenseKeyId);
    await this.repo.markCompleted(tx, task.id, actor.appUserId, input.evidence, now);
    if (input.licenseKeyId !== undefined) {
      await this.keys.assign(tx, actor, {
        organizationId,
        licenseKeyId: input.licenseKeyId,
        assignmentId: task.assignmentId,
        subscriptionId: task.assignment.subscriptionId,
      });
    }
    const completedOn = await this.organizationReads.businessToday(now, tx);
    await this.assignments.recordGranted(tx, task.assignmentId, completedOn);
    if (task.requestId === null) return;

    const pooled = provisioningType === 'K2' || provisioningType === 'K4';
    // From the pool means taken from a free seat or key: a K2 or K4 grant with nothing bought for it (`BR-MF1-09c`).
    const fromPool = pooled && task.purchase === null;
    await this.gate.get().reportOutcome(tx, task.requestId, 'COMPLETED', task.assignment.employeeId, {
      fromPool,
      provisioningType,
      grantedOn: completedOn,
      assignmentId: task.assignmentId,
    });
    if (!fromPool) return;
    await this.sharedPool.recordAvoided(tx, {
      organizationId,
      completedOn,
      task: {
        id: task.id,
        assignmentId: task.assignmentId,
        requestId: task.requestId,
        planId: task.assignment.planId,
        subscriptionId: task.assignment.subscriptionId,
        provisioningType,
      },
    });
  }
}
