import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { confirmedRoleOf, isOverdue, isValueAllowed } from './handover-confirmer.policy';
import { HandoverCaseFacts } from './handover-case-facts.service';
import { HandoverConfirmerResolver } from './handover-confirmer.service';
import { HandoverDutyError } from './handover.errors';
import { HandoverRepo, type DutyRecord } from './handover.repo';

/**
 * The confirmation that the data was handed over (`US-03-09` AC-2, AC-7, AC-8, `US-07-09` AC-15, AC-20 to AC-22): written once by the
 * person the duty falls to now, in the role they have when they write it, with the moment and whether it came after the deadline.
 * It never creates, blocks or changes a revocation, and one that comes after the revocation went on is only recorded. Nobody else may
 * write it: not another head, not a head who handed over, not the IT Admin for a head, not Finance, an approver or the Super Admin.
 */
@Injectable()
export class HandoverConfirmationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: HandoverRepo,
    private readonly resolver: HandoverConfirmerResolver,
    private readonly facts: HandoverCaseFacts,
    private readonly audit: AuditApi,
  ) {}

  /** Throws HandoverDutyError (`NOT_FOUND`, `NOT_CONFIRMER`, `CANCELLED`, `ALREADY_CONFIRMED`, `VALUE_NOT_ALLOWED`). */
  async confirm(actor: AuthenticatedPrincipal, id: string, value: string): Promise<DutyRecord> {
    return this.runner.run(async (tx) => {
      const now = new Date();
      const duty = await this.repo.lock(tx, id);
      if (!duty) throw new HandoverDutyError('NOT_FOUND');

      const today = await this.facts.today(now, tx);
      const resolved = (await this.resolver.resolve([duty], today, tx)).get(duty.id);
      const mayConfirm =
        duty.confirmerRole === 'IT_ADMIN'
          ? actor.roles.includes('IT_ADMIN')
          : resolved?.confirmer.employeeId === actor.employeeId;
      if (!mayConfirm) throw new HandoverDutyError('NOT_CONFIRMER');
      if (duty.cancelledAt) throw new HandoverDutyError('CANCELLED');
      if (duty.confirmedAt) throw new HandoverDutyError('ALREADY_CONFIRMED');
      if (!isValueAllowed(duty.source, value)) throw new HandoverDutyError('VALUE_NOT_ALLOWED');

      const role = confirmedRoleOf(duty, actor.employeeId, resolved?.headTodayId ?? null);
      const late = isOverdue(duty.dueOn, today);
      if (!(await this.repo.confirm(tx, duty.id, { value, byEmployeeId: actor.employeeId, role, at: now, late }))) {
        throw new HandoverDutyError('ALREADY_CONFIRMED');
      }
      // Who confirmed, and in which role: never mixed with who works the revocation, which is a different event on the task.
      await this.audit.record(
        tx,
        licensingAuditEvent(actor, duty.organizationId, 'HANDOVER_DUTY.CONFIRMED', 'HandoverDuty', duty.id, null, {
          assignmentId: duty.assignmentId,
          employeeId: duty.employeeId,
          source: duty.source,
          value,
          confirmedByEmployeeId: actor.employeeId,
          confirmedRole: role,
          late,
          proceededWithoutConfirmation: duty.proceededUnconfirmedAt !== null,
        }),
      );

      const confirmed = await this.repo.find(duty.id, tx);
      if (!confirmed) throw new HandoverDutyError('NOT_FOUND');

      return confirmed;
    });
  }
}
