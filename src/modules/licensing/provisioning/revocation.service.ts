import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/catalog.service';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import { OrganizationService } from '../../organization/organization.service';
import { AssignmentEndService } from '../assignment/assignment-end.service';
import { SeatTargetNotFoundError } from '../licensing.errors';
import type {
  OpenedRevocation,
  OpenRevocationInput,
  RevocationReasonFacts,
  RevocationSource,
} from '../licensing.types';
import { licensingAuditEvent } from '../mappers/licensing-audit-event';
import { maxAttempts as maxAttemptsFor } from './failure.policy';
import { RegisteredRevocationHook } from './registered-revocation-hook.service';
import { assertRevocable, assertRevocationSource, isOpenAssignment } from './revocation.policy';
import { ProvisioningTaskFrame } from './provisioning-task-frame.service';
import { toRevocationFacts, type ProvisioningTaskRecord } from './provisioning-task.record';
import { ProvisioningTaskReasonRepo, type ReasonRecord } from './provisioning-task-reason.repo';
import { ProvisioningTaskRepo } from './provisioning-task.repo';

const factsOf = (reason: ReasonRecord): RevocationReasonFacts => ({
  source: reason.source,
  decidedByEmployeeId: reason.decidedByEmployeeId,
  decidedRole: reason.decidedRole,
  referenceKind: reason.referenceKind,
  referenceId: reason.referenceId,
});

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
    private readonly catalog: CatalogService,
    private readonly organization: OrganizationService,
    private readonly parameters: OperatingParametersService,
    private readonly audit: AuditService,
    private readonly frame: ProvisioningTaskFrame,
    private readonly hook: RegisteredRevocationHook,
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

    const task = live ?? (await this.create(tx, actor, { organizationId: organization.id, assignment, source, now }));
    const reason = await this.reasons.insert(tx, {
      taskId: task.id,
      source,
      decidedByEmployeeId: input.decision.decidedByEmployeeId ?? null,
      decidedRole: input.decision.decidedRole.trim(),
      referenceKind: input.decision.referenceKind ?? null,
      referenceId,
      note: input.decision.note?.trim() || null,
    });
    // The audit event carries who decided and on what, never the note or the account.
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        organization.id,
        live ? 'PROVISIONING_TASK.REVOCATION_REASON_ADDED' : 'PROVISIONING_TASK.REVOCATION_OPENED',
        'ProvisioningTask',
        task.id,
        live ? { status: task.status } : null,
        {
          assignmentId: assignment.id,
          source,
          decidedByEmployeeId: reason.decidedByEmployeeId,
          decidedRole: reason.decidedRole,
          referenceKind: reason.referenceKind,
          referenceId: reason.referenceId,
          defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
          selfExecuted,
        },
      ),
    );
    // An IT Admin who asks for their own seat to go because no other IT Admin can is told to the Super Admin (`SoD-5`, F24).
    if (selfExecuted) await this.frame.tellSuperAdmin(tx, organization.id, task.id, actor.employeeId);
    const reasons = (await this.reasons.listOf([task.id], tx)).map(factsOf);
    await this.hook.onOpened(tx, toRevocationFacts(task), reasons, input.context ?? {}, actor, now);

    return { taskId: task.id, created: live === null, reasonAdded: live !== null, status: task.status };
  }

  /** The task a seat did not have yet: manual, queued for the IT Admin in charge of the holder's department today. */
  private async create(
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

  /** The rule of the IT Admin who is the one revoked (`QĐ-77m`); a person who is not an IT Admin is never restricted by it. */
  private async selfExecuted(tx: DbTx, actor: AuthenticatedPrincipal, holderEmployeeId: string): Promise<boolean> {
    if (!actor.roles.includes('IT_ADMIN')) return false;

    return (await this.frame.selfExecutionMode(actor, holderEmployeeId, tx)) === 'ALLOW_SELF_EXECUTED';
  }
}
