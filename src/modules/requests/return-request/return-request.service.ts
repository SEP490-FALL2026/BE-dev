import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { SeatTargetNotFoundError } from '../../licensing/public/licensing.errors';
import type { AssignmentFacts } from '../../licensing/public/licensing-renewal.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestSuperAdminCannotRequestError } from '../access-request/access-request.errors';
import { mayRequest } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { ReturnBodyDto } from './return-request.dto';
import { ReturnRequestRefusedError } from './return-request.errors';
import { checkReturnable, checkSender, originMatches, returnSubmittedDetail } from './return-request.policy';
import { ReturnRequestRepo, type ReturnRequestRecord } from './return-request.repo';
import { ReturnSeatGate } from './return-seat-gate.service';

/**
 * Sending the return of a seat (`US-05-13`, `US-01-12` AC-3). The return is a record of its own, not a
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
    private readonly organizationReads: OrganizationReadApi,
    private readonly seat: ReturnSeatGate,
    private readonly catalog: CatalogApi,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Throws ReturnRequestRefusedError, plus what the gate throws that is not a refusal of the seat (the database not answering).
   */
  async submit(actor: AuthenticatedPrincipal, body: ReturnBodyDto): Promise<ReturnRequestRecord> {
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();
    const reason = body.reason.trim();

    return this.runner.run(async (tx) => {
      const now = new Date();
      const today = await this.organizationReads.businessToday(now, tx);
      const { facts, holderUnit, sender, plan } = await this.requireReturnable(tx, actor, body, today);

      // The revocation is opened first: it holds the lock of the seat, so what is judged after it is judged on a seat nobody else
      // is changing, and a rollback takes the task and its reason with it.
      const id = randomUUID();
      const opened = await this.seat.openRevocation(tx, actor, {
        assignmentId: facts.assignmentId,
        returnRequestId: id,
        head: sender.source === 'HEAD_CONFIRMATION',
        reason,
        now,
      });
      if (await this.returns.findAwaitingOf(facts.assignmentId, tx))
        throw new ReturnRequestRefusedError('ALREADY_REQUESTED');
      if (await this.seat.hasPendingRenewal(facts.assignmentId, tx)) {
        throw new ReturnRequestRefusedError('RENEWAL_PENDING');
      }

      const organization = await this.organizationReads.getOrganization(tx);
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
        handoverRequired: false,
        handoverDueOn: null,
        originRequestId: body.fromRequestId ?? null,
        createdByAppUserId: actor.appUserId,
      });

      // The audit event says who, which seat and which task; the warning that the revocation is coming is for the notices.
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          organization.id,
          'RETURN_REQUEST.SUBMITTED',
          'RETURN_REQUEST',
          created.id,
          returnSubmittedDetail({ ...created, revocationTaskCreated: opened.created }),
        ),
      );

      return created;
    });
  }

  /** The seat, who may return it, and the plan and the origin it is judged against. Throws ReturnRequestRefusedError. */
  private async requireReturnable(tx: DbTx, actor: AuthenticatedPrincipal, body: ReturnBodyDto, today: string) {
    // The sender and the holder of the seat cannot be the spending approver (`D-S21`): judged before any department is read.
    const facts = await this.seat.factsOf(tx, actor.employeeId, body.assignmentId);
    const holderUnit = (await this.organizationReads.getOwningUnits([facts.employeeId], today, tx)).get(
      facts.employeeId,
    );
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId, today);
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

    return { facts, holderUnit, sender, plan };
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
}
