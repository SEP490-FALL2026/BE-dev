import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { AssignmentService } from '../../assignment/assignment.service';
import { LicenseKeyAssignmentService } from '../../license-key/license-key-assignment.service';
import { GrantRequestGateHook } from '../../public/licensing.extension-points';
import { SharedPoolService } from '../../shared-pool/shared-pool.service';
import type { K1ChecklistClaim } from '../k1-checklist/provisioning-k1-checklist.policy';
import { ProvisioningK1Checklist } from '../k1-checklist/provisioning-k1-checklist.service';
import { ProvisioningK1ChecklistError, ProvisioningKeyError } from '../provisioning.errors';
import { assertKeyFits } from '../provisioning.policy';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';

/**
 * What the completion of the task of a grant writes, in the transaction that holds the task (`US-07-01`, `BR-MF1-09`): the task is
 * completed, a K4 seat is given the free key of the store the IT Admin names (the subscription, then the key, locked in that order), the day
 * the right begins is recorded (`BR-MF1-06a`), the request is told the outcome with whether the seat came from the pool, and a grant taken
 * from the pool with nothing bought records the cost it avoided once (`BR-MF1-09c`). The grant of a K1 seat is completed with its checklist
 * (`QĐ-111az`): judged and kept with the task, before the task is marked completed (a completed task is never changed again). Throws
 * ProvisioningKeyError, ProvisioningK1ChecklistError, LicenseKeyNotFoundError, LicenseKeyStateError and whatever the request gate throws. The
 * task of an extension (`EXTEND`, `BR-MF1-08d`) only completes and tells the request, which writes the record that follows the renewed one.
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
    private readonly checklists: ProvisioningK1Checklist,
  ) {}

  /**
   * An extension grants nothing and names no key or checklist: the renewal it answers for is applied by the module of requests (`BR-MF1-08d`).
   * Throws ProvisioningKeyError, ProvisioningK1ChecklistError.
   */
  private async writeExtension(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    context: { task: ProvisioningTaskRecord; requestId: string; now: Date },
    input: { evidence: string; licenseKeyId?: string | undefined; k1Checklist?: K1ChecklistClaim | undefined },
  ): Promise<void> {
    if (input.licenseKeyId !== undefined) throw new ProvisioningKeyError('KEY_NOT_APPLICABLE');
    if (input.k1Checklist !== undefined) throw new ProvisioningK1ChecklistError('K1_CHECKLIST_NOT_ALLOWED');
    await this.repo.markCompleted(tx, context.task.id, actor.appUserId, input.evidence, context.now);
    await this.gate.get().reportExtended(tx, actor, context.requestId, context.now);
  }

  async write(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    context: { task: ProvisioningTaskRecord; now: Date; organizationId: string },
    input: { evidence: string; licenseKeyId?: string | undefined; k1Checklist?: K1ChecklistClaim | undefined },
  ): Promise<void> {
    const { task, now, organizationId } = context;
    if (task.kind === 'EXTEND' && task.requestId !== null) {
      await this.writeExtension(tx, actor, { task, requestId: task.requestId, now }, input);

      return;
    }
    const provisioningType = await this.sharedPool.provisioningTypeOf(tx, task.assignment.planId);
    assertKeyFits(provisioningType, input.licenseKeyId);
    // A K1 grant keeps its checklist first; the evidence it stands on is the one of the checklist, or the one beside it.
    const checklist = this.checklists.planGrant({
      type: provisioningType,
      claim: input.k1Checklist,
      evidence: input.evidence,
    });
    if (checklist) await this.checklists.record(tx, task.id, checklist);
    await this.repo.markCompleted(tx, task.id, actor.appUserId, checklist?.evidence ?? input.evidence, now);
    if (input.licenseKeyId !== undefined) {
      await this.keys.assign(tx, actor, {
        organizationId,
        licenseKeyId: input.licenseKeyId,
        assignmentId: task.assignmentId,
        subscriptionId: task.assignment.subscriptionId,
      });
    }
    const completedOn = await this.organizationReads.businessToday(now, tx);
    const granted = await this.assignments.recordGranted(tx, task.assignmentId, completedOn);
    if (task.requestId === null) return;

    const pooled = provisioningType === 'K2' || provisioningType === 'K4';
    // From the pool means taken from a free seat or key: a K2 or K4 grant with nothing bought for it (`BR-MF1-09c`).
    const fromPool = pooled && task.purchase === null;
    await this.gate.get().reportOutcome(tx, task.requestId, 'COMPLETED', task.assignment.employeeId, {
      fromPool,
      provisioningType,
      grantedOn: completedOn,
      assignmentId: task.assignmentId,
      effectiveFrom: granted.effectiveFrom,
      expectedEndDate: granted.expectedEndDate,
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
