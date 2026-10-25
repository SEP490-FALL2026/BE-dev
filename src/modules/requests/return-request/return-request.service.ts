import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/catalog.service';
import {
  AssignmentNotFoundError,
  AssignmentNotOpenError,
  RevocationRefusedError,
  SeatTargetNotFoundError,
} from '../../licensing/licensing.errors';
import { LicensingService } from '../../licensing/licensing.service';
import type { AssignmentFacts } from '../../licensing/licensing-renewal.types';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import { OrganizationService } from '../../organization/organization.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { ReturnBodyDto } from './return-request.dto';
import { ReturnRequestRefusedError } from './return-request.errors';
import { checkReturnable, checkSender, mayReadReturn, originMatches } from './return-request.policy';
import { ReturnRequestRepo, type ReturnRequestRecord } from './return-request.repo';
import { handoverFor } from './handover.policy';

const SHORT_DEADLINE_PARAMETER = 'HANDOVER_SHORT_DEADLINE_WORKING_DAYS';

/**
 * Sending the return of a seat and confirming its handover (`US-05-13`, `US-01-12` AC-3). The return is a record of its own, not a
 * request that goes through steps: it names exactly one seat, and the person who is its holder returns it, or the head of the
 * department of the holder confirms it is no longer needed. It opens the revocation of the seat in the same transaction, through
 * the one gate of licensing (the seat is given back only when that task is completed), and snapshots what the plan asks of the
 * handover. A seat that is already being revoked takes the return as one more reason of its task. A refused return leaves
 * nothing behind. Neither the reason nor the identifier of the account enters an audit event.
 */
@Injectable()
export class ReturnRequestService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly returns: ReturnRequestRepo,
    private readonly requests: AccessRequestRepo,
    private readonly organization: OrganizationService,
    private readonly licensing: LicensingService,
    private readonly catalog: CatalogService,
    private readonly parameters: OperatingParametersService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Throws ReturnRequestRefusedError, plus what the gate throws that is not a refusal of the seat (the database not answering).
   */
  async submit(actor: AuthenticatedPrincipal, body: ReturnBodyDto): Promise<ReturnRequestRecord> {
    const shortDeadlineWorkingDays = Number(await this.parameters.getValue(SHORT_DEADLINE_PARAMETER));
    const reason = body.reason.trim();

    return this.runner.run(async (tx) => {
      const now = new Date();
      const today = await this.organization.businessToday(now, tx);
      const facts = await this.factsOf(tx, body.assignmentId);
      const holderUnit = (await this.organization.getOwningUnits([facts.employeeId], today, tx)).get(facts.employeeId);
      const headed = await this.organization.getHeadedDepartment(actor.employeeId, today);
      const sender = checkSender({
        actorEmployeeId: actor.employeeId,
        holderEmployeeId: facts.employeeId,
        holderDepartmentId: holderUnit?.departmentId ?? null,
        actorHeadedDepartmentId: headed?.departmentId ?? null,
      });
      if (!sender.ok) throw new ReturnRequestRefusedError(sender.refusal);
      if (!holderUnit) throw new ReturnRequestRefusedError('NO_DEPARTMENT');

      const [plan] = await this.catalog.getPlanRevocationInfo([facts.planId], tx);
      if (!plan) throw new SeatTargetNotFoundError('PLAN');
      const problem = checkReturnable({
        open: facts.open,
        kind: facts.kind,
        provisioningType: plan.provisioningType,
        grant: facts.grant,
      });
      if (problem) throw new ReturnRequestRefusedError('ASSIGNMENT_NOT_RETURNABLE', problem);
      if (body.fromRequestId !== undefined) await this.assertOrigin(tx, actor, facts, body.fromRequestId);

      // The revocation is opened first: it holds the lock of the seat, so what is judged after it is judged on a seat nobody else
      // is changing, and a rollback takes the task and its reason with it.
      const id = randomUUID();
      const head = sender.source === 'HEAD_CONFIRMATION';
      const opened = await this.openRevocation(tx, actor, {
        assignmentId: facts.assignmentId,
        returnRequestId: id,
        head,
        reason,
        now,
      });
      if (await this.returns.findAwaitingOf(facts.assignmentId, tx))
        throw new ReturnRequestRefusedError('ALREADY_REQUESTED');
      if (await this.licensing.hasPendingRenewal(facts.assignmentId, tx)) {
        throw new ReturnRequestRefusedError('RENEWAL_PENDING');
      }

      const handover = handoverFor({
        dataLossOnRemoval: plan.dataLossOnRemoval,
        requestedOn: today,
        shortDeadlineWorkingDays,
      });
      const organization = await this.organization.getOrganization(tx);
      if (!organization) throw new Error('A return was sent before installation');
      const created = await this.returns.insert(tx, {
        id,
        organizationId: organization.id,
        assignmentId: facts.assignmentId,
        planId: facts.planId,
        revocationTaskId: opened.taskId,
        requestedByEmployeeId: actor.employeeId,
        holderEmployeeId: facts.employeeId,
        departmentId: holderUnit.departmentId,
        source: sender.source,
        reason,
        requestedOn: today,
        revocationNote: plan.revocationNote?.trim() || null,
        handoverRequired: handover.required,
        handoverDueOn: handover.dueOn,
        originRequestId: body.fromRequestId ?? null,
        createdByAppUserId: actor.appUserId,
      });

      // The audit event says who, which seat and which task; the warning that the revocation is coming is for the notices.
      await this.audit.record(
        tx,
        accessRequestAuditEvent(actor, organization.id, 'RETURN_REQUEST.SUBMITTED', 'RETURN_REQUEST', created.id, {
          returnRequestId: created.id,
          assignmentId: facts.assignmentId,
          planId: facts.planId,
          holderEmployeeId: facts.employeeId,
          requestedByEmployeeId: actor.employeeId,
          source: sender.source,
          departmentId: holderUnit.departmentId,
          revocationTaskId: opened.taskId,
          revocationTaskCreated: opened.created,
          handoverRequired: handover.required,
          handoverDueOn: handover.dueOn,
          originRequestId: body.fromRequestId ?? null,
        }),
      );

      return created;
    });
  }

  /**
   * The person who triggered the return says that the handover of the data is done (`US-05-13` AC-6, `QĐ-62f`). Throws
   * ReturnRequestRefusedError.
   */
  async confirmHandover(actor: AuthenticatedPrincipal, id: string): Promise<ReturnRequestRecord> {
    return this.runner.run(async (tx) => {
      const now = new Date();
      const found = await this.returns.lockById(tx, id);
      const headed = await this.organization.getHeadedDepartment(
        actor.employeeId,
        await this.organization.businessToday(now, tx),
      );
      if (
        !found ||
        !mayReadReturn({
          actorEmployeeId: actor.employeeId,
          roles: actor.roles,
          holderEmployeeId: found.holderEmployeeId,
          requestedByEmployeeId: found.requestedByEmployeeId,
          returnDepartmentId: found.departmentId,
          actorHeadedDepartmentId: headed?.departmentId ?? null,
        })
      ) {
        throw new ReturnRequestRefusedError('NOT_FOUND');
      }
      if (actor.employeeId !== found.requestedByEmployeeId) throw new ReturnRequestRefusedError('NOT_REQUESTER');
      if (found.state !== 'AWAITING_REVOCATION') throw new ReturnRequestRefusedError('NOT_AWAITING');
      if (!found.handoverRequired) throw new ReturnRequestRefusedError('HANDOVER_NOT_REQUIRED');
      if (found.handoverConfirmedAt !== null) throw new ReturnRequestRefusedError('HANDOVER_ALREADY_CONFIRMED');

      await this.returns.confirmHandover(tx, found.id, actor.employeeId, now);
      const today = await this.organization.businessToday(now, tx);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          found.organizationId,
          'RETURN_REQUEST.HANDOVER_CONFIRMED',
          'RETURN_REQUEST',
          found.id,
          {
            returnRequestId: found.id,
            assignmentId: found.assignmentId,
            confirmedByEmployeeId: actor.employeeId,
            onTime: found.handoverDueOn === null || today <= found.handoverDueOn,
          },
        ),
      );

      const confirmed = await this.returns.findById(found.id, tx);
      if (!confirmed) throw new Error(`The return ${found.id} was not found after its handover was confirmed.`);

      return confirmed;
    });
  }

  private async factsOf(tx: DbTx, assignmentId: string): Promise<AssignmentFacts> {
    try {
      return await this.licensing.getAssignmentFacts(tx, assignmentId);
    } catch (error) {
      if (error instanceof AssignmentNotFoundError) throw new ReturnRequestRefusedError('ASSIGNMENT_NOT_FOUND');
      throw error;
    }
  }

  /** The request the return says it follows: the one whose grant made this seat, which the person has a part in and which is done. */
  private async assertOrigin(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    facts: AssignmentFacts,
    fromRequestId: string,
  ): Promise<void> {
    const request = await this.requests.findById(fromRequestId, tx);
    const matches = originMatches({
      actorEmployeeId: actor.employeeId,
      request,
      grantRequestId: facts.grantRequestId,
      fromRequestId,
    });
    if (!matches) throw new ReturnRequestRefusedError('ORIGIN_MISMATCH');
  }

  /**
   * Opens the revocation as the source it is. The person who sends the return is not the IT Admin who will work it, even when they
   * hold that role: the rule of an IT Admin who revokes their own seat is applied when the task is taken, so the role is not
   * handed to the gate here. A refusal of the gate that is a fact about the seat is answered as the return it is.
   */
  private async openRevocation(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { assignmentId: string; returnRequestId: string; head: boolean; reason: string; now: Date },
  ) {
    const asSender = { ...actor, roles: actor.roles.filter((role) => role !== 'IT_ADMIN') };
    try {
      return await this.licensing.openRevocation(tx, asSender, {
        assignmentId: input.assignmentId,
        source: input.head ? 'MANAGER_NOT_NEEDED' : 'RETURN',
        decision: {
          decidedByEmployeeId: actor.employeeId,
          decidedRole: input.head ? 'MANAGER' : 'EMPLOYEE',
          referenceKind: 'RETURN_REQUEST',
          referenceId: input.returnRequestId,
          note: input.reason,
        },
        now: input.now,
      });
    } catch (error) {
      if (error instanceof AssignmentNotOpenError) {
        throw new ReturnRequestRefusedError('ASSIGNMENT_NOT_RETURNABLE', 'NOT_OPEN');
      }
      if (error instanceof RevocationRefusedError && error.problem === 'ASSIGNMENT_IS_SERVICE_ACCOUNT') {
        throw new ReturnRequestRefusedError('ASSIGNMENT_NOT_RETURNABLE', 'SERVICE_ACCOUNT');
      }
      if (error instanceof RevocationRefusedError && error.problem === 'TYPE_NOT_SUPPORTED') {
        throw new ReturnRequestRefusedError('ASSIGNMENT_NOT_RETURNABLE', 'PLAN_NOT_SUPPORTED');
      }
      throw error;
    }
  }
}
