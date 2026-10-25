import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { OrganizationHistoryService } from '../../organization/organization-history.service';
import { OrganizationService } from '../../organization/organization.service';
import { AssignmentNotOpenError } from '../licensing.errors';
import { licensingAuditEvent } from '../mappers/licensing-audit-event';
import { AssignmentResponsibleService } from './assignment-responsible.service';
import { RegisteredResponsibleDeadline } from './registered-responsible-deadline.service';
import { ServiceAccountMoveError } from './service-account.errors';
import {
  assertMovable,
  assertMoveProposal,
  assertMoveTarget,
  confirmerRoleOf,
  type MoveConfirmerRole,
} from './service-account-move.policy';
import { ServiceAccountMoveRepo, type MoveRecord } from './service-account-move.repo';

export interface ProposeMoveInput {
  toDepartmentId: string;
  newResponsibleEmployeeId: string;
  effectiveFrom: BusinessDate;
  expectedEndDate: BusinessDate | null;
}

/**
 * Moving a service account to another department (`US-03-08` AC-10, `QĐ-86c`): the IT Admin proposes, the proposal waits and
 * touches no assignment, and the head of the receiving department (the fallback approver when it has none) confirms. The
 * confirmation ends the old assignment the day the move takes effect and opens the next in the receiving department, owned and
 * charged there, in one transaction; nothing is granted or revoked and no commitment is touched. Throws ServiceAccountMoveError and
 * the errors of the assignment.
 */
@Injectable()
export class ServiceAccountMoveService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationService,
    private readonly history: OrganizationHistoryService,
    private readonly identity: IdentityAccessService,
    private readonly responsible: AssignmentResponsibleService,
    private readonly deadlines: RegisteredResponsibleDeadline,
    private readonly moves: ServiceAccountMoveRepo,
    private readonly audit: AuditService,
  ) {}

  async propose(actor: AuthenticatedPrincipal, assignmentId: string, input: ProposeMoveInput): Promise<MoveRecord> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A service account moved before installation');
    const today = await this.organization.businessToday();

    return this.runner.run(async (tx) => {
      const current = await this.responsible.lockAssignment(tx, assignmentId);
      const target = await this.organization.lockDepartmentShared(tx, input.toDepartmentId);
      const holder = await this.responsible.lockHolder(tx, input.newResponsibleEmployeeId, input.effectiveFrom);
      const [file] = await this.deadlines.listPending({ employeeIds: [current.employeeId], limit: 1 }, tx);
      assertMoveProposal({
        current,
        today,
        effectiveFrom: input.effectiveFrom,
        expectedEndDate: input.expectedEndDate,
        deadline: file?.dueOn ?? null,
        toDepartmentId: input.toDepartmentId,
        target,
        responsible: holder,
      });

      let move: MoveRecord;
      try {
        move = await this.moves.insert(tx, {
          organizationId: organization.id,
          assignmentId: current.id,
          fromDepartmentId: current.owningDepartmentId as string,
          toDepartmentId: input.toDepartmentId,
          newResponsibleEmployeeId: input.newResponsibleEmployeeId,
          effectiveFrom: input.effectiveFrom,
          expectedEndDate: input.expectedEndDate,
          proposedByAppUserId: actor.appUserId,
        });
      } catch (error) {
        if (isUniqueViolation(error, 'one_pending_per_assignment')) throw new ServiceAccountMoveError('PENDING_EXISTS');
        throw error;
      }
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization.id,
          'SERVICE_ACCOUNT_MOVE.PROPOSED',
          'ServiceAccountMove',
          move.id,
          null,
          {
            assignmentId: move.assignmentId,
            fromDepartmentId: move.fromDepartmentId,
            toDepartmentId: move.toDepartmentId,
            newResponsibleEmployeeId: move.newResponsibleEmployeeId,
            effectiveFrom: move.effectiveFrom,
            expectedEndDate: move.expectedEndDate,
          },
        ),
      );

      return move;
    });
  }

  /**
   * The head of the receiving department confirms: the old assignment ends the day the move takes effect and the next begins that
   * day there, chained to it. A move whose day has passed, whose account is no longer open or whose person or department no longer
   * fits is refused and has to be proposed again.
   */
  async confirm(actor: AuthenticatedPrincipal, id: string): Promise<MoveRecord> {
    const probe = await this.moves.find(id);
    if (!probe) throw new ServiceAccountMoveError('NOT_FOUND');
    const today = await this.organization.businessToday();

    return this.runner.run(async (tx) => {
      const current = await this.responsible.lockAssignment(tx, probe.assignmentId);
      const move = await this.moves.lock(tx, id);
      if (!move) throw new ServiceAccountMoveError('NOT_FOUND');
      const role = await this.confirmerRole(tx, actor, move.toDepartmentId, today);
      if (!role) throw new ServiceAccountMoveError('NOT_CONFIRMER');
      if (move.status !== 'PENDING') throw new ServiceAccountMoveError('NOT_PENDING');
      if (move.effectiveFrom < today) throw new ServiceAccountMoveError('MOVE_EFFECTIVE_DATE_PASSED');

      assertMovable(current);
      if (current.owningDepartmentId !== move.fromDepartmentId) throw new AssignmentNotOpenError();
      const target = await this.organization.lockDepartmentShared(tx, move.toDepartmentId);
      const holder = await this.responsible.lockHolder(tx, move.newResponsibleEmployeeId, move.effectiveFrom);
      assertMoveTarget({
        current,
        toDepartmentId: move.toDepartmentId,
        target,
        responsible: holder,
        effectiveFrom: move.effectiveFrom,
        expectedEndDate: move.expectedEndDate,
      });

      const { created } = await this.responsible.succeed(tx, actor, move.organizationId, current, {
        employeeId: move.newResponsibleEmployeeId,
        owningDepartmentId: move.toDepartmentId,
        costCenterId: holder?.costCenterId ?? null,
        effectiveFrom: move.effectiveFrom,
        expectedEndDate: move.expectedEndDate,
      });
      const confirmed = await this.moves.markConfirmed(tx, move.id, {
        employeeId: actor.employeeId,
        role,
        resultingAssignmentId: created.id,
        now: new Date(),
      });
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          move.organizationId,
          'SERVICE_ACCOUNT_MOVE.CONFIRMED',
          'ServiceAccountMove',
          move.id,
          { status: 'PENDING' },
          {
            status: 'CONFIRMED',
            assignmentId: move.assignmentId,
            resultingAssignmentId: created.id,
            fromDepartmentId: move.fromDepartmentId,
            toDepartmentId: move.toDepartmentId,
            proposedByAppUserId: move.proposedByAppUserId,
            confirmedByEmployeeId: actor.employeeId,
            confirmedByRole: role,
            effectiveFrom: move.effectiveFrom,
          },
        ),
      );

      return confirmed;
    });
  }

  /** The IT Admin withdraws a proposal that still waits, with the reason. */
  async cancel(actor: AuthenticatedPrincipal, id: string, reason: string): Promise<MoveRecord> {
    const trimmed = reason.trim();
    if (trimmed === '') throw new ServiceAccountMoveError('REASON_REQUIRED');

    return this.runner.run(async (tx) => {
      const move = await this.moves.lock(tx, id);
      if (!move) throw new ServiceAccountMoveError('NOT_FOUND');
      if (move.status !== 'PENDING') throw new ServiceAccountMoveError('NOT_PENDING');
      const cancelled = await this.moves.markCancelled(tx, id, {
        appUserId: actor.appUserId,
        reason: trimmed,
        now: new Date(),
      });
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          move.organizationId,
          'SERVICE_ACCOUNT_MOVE.CANCELLED',
          'ServiceAccountMove',
          move.id,
          { status: 'PENDING' },
          { status: 'CANCELLED', assignmentId: move.assignmentId, reason: trimmed },
        ),
      );

      return cancelled;
    });
  }

  /** Whether the caller may confirm a move into this department today, and in which role. */
  private async confirmerRole(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    departmentId: string,
    today: BusinessDate,
  ): Promise<MoveConfirmerRole | null> {
    const heads = await this.history.getHeadsOnDates([{ departmentId, onDate: today }], tx);
    const holders = await this.identity.getApprovalRoleHolders(tx);

    return confirmerRoleOf({
      actorEmployeeId: actor.employeeId,
      headTodayId: heads.get(`${departmentId}|${today}`) ?? null,
      fallbackApproverId: holders.fallbackApproverEmployeeId,
    });
  }
}
