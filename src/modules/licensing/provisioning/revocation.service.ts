import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AssignmentEndService } from '../assignment/assignment-end.service';
import { SeatTargetNotFoundError } from '../public/licensing.errors';
import type { OpenedRevocation, OpenRevocationInput } from '../public/licensing.types';
import { assertRevocable, assertRevocationSource, isOpenAssignment } from './revocation.policy';
import { ProvisioningTaskFrame } from './provisioning-task-frame.service';
import { ProvisioningTaskReasonRepo } from './provisioning-task-reason.repo';
import { ProvisioningTaskRepo } from './provisioning-task.repo';
import { RevocationRecorder } from './revocation-recorder.service';
import { RevocationTaskFactory } from './revocation-task-factory.service';

/**
 * The one gate that opens the revocation of a seat (`US-07-05` AC-3, AC-11, AC-12): every source (a return, a departure, a
 * transfer review, an expiry, a reduced or cancelled subscription...) calls it in its own transaction, and nothing else makes a
 * revocation. A seat has one live task however many reasons ask for it (`QĐ-64a`): the first reason opens it and the others
 * are rows beside it. Asking again for the same source and reference changes nothing. The assignment stays whole until the task
 * is done, so the seat is not given back by being asked for. Locks in the order of whoever works the task: the task, the
 * subscription, the assignment.
 */
@Injectable()
export class RevocationService {
  constructor(
    private readonly tasks: ProvisioningTaskRepo,
    private readonly reasons: ProvisioningTaskReasonRepo,
    private readonly ending: AssignmentEndService,
    private readonly catalog: CatalogApi,
    private readonly organization: OrganizationApi,
    private readonly frame: ProvisioningTaskFrame,
    private readonly factory: RevocationTaskFactory,
    private readonly recorder: RevocationRecorder,
  ) {}

  /**
   * Opens the revocation of a personal seat, or adds the reason to the one it has. Throws RevocationRefusedError,
   * AssignmentNotFoundError, AssignmentNotOpenError, SeatTargetNotFoundError and ProvisioningAnotherItAdminNeededError (an IT
   * Admin who asks for their own seat while another IT Admin can).
   */
  async open(tx: DbTx, actor: AuthenticatedPrincipal, input: OpenRevocationInput): Promise<OpenedRevocation> {
    const source = assertRevocationSource(input.source);
    const now = input.now ?? new Date();
    const referenceId = input.decision.referenceId ?? null;

    let live = await this.tasks.lockLiveRevocation(tx, input.assignmentId);
    const assignment = await this.ending.lock(tx, input.assignmentId);
    live ??= await this.tasks.lockLiveRevocation(tx, input.assignmentId);
    if (live && (await this.reasons.find(tx, live.id, source, referenceId))) {
      return { taskId: live.id, created: false, reasonAdded: false, status: live.status };
    }

    const [plan] = await this.catalog.getPlanRevocationInfo([assignment.planId], tx);
    if (!plan) throw new SeatTargetNotFoundError('PLAN');
    assertRevocable({
      kind: assignment.kind,
      open: isOpenAssignment(assignment),
      provisioningType: plan.provisioningType,
    });
    const selfExecuted = await this.selfExecuted(tx, actor, assignment.employeeId);
    const organization = await this.organization.getOrganization(tx);
    if (!organization) throw new Error('A revocation was opened before installation');

    const task =
      live ?? (await this.factory.create(tx, actor, { organizationId: organization.id, assignment, source, now }));
    await this.recorder.record(tx, actor, {
      organizationId: organization.id,
      task,
      reused: live !== null,
      assignmentId: assignment.id,
      source,
      input,
      selfExecuted,
      now,
    });

    return { taskId: task.id, created: live === null, reasonAdded: live !== null, status: task.status };
  }

  /** The rule of the IT Admin who is the one revoked (`QĐ-77m`); a person who is not an IT Admin is never restricted by it. */
  private async selfExecuted(tx: DbTx, actor: AuthenticatedPrincipal, holderEmployeeId: string): Promise<boolean> {
    if (!actor.roles.includes('IT_ADMIN')) return false;

    return (await this.frame.selfExecutionMode(actor, holderEmployeeId, tx)) === 'ALLOW_SELF_EXECUTED';
  }
}
