import { Injectable } from '@nestjs/common';
import { addDays } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type {
  CancelHandoverInput,
  HandoverDutyBrief,
  OpenedHandoverDuties,
  OpenHandoverDutiesInput,
  ReconcileHandoverInput,
} from '../public/licensing-handover.types';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { RevocationViewService } from '../provisioning/revocation-view.service';
import { isOverdue } from './handover-confirmer.policy';
import { HandoverConfirmerResolver } from './handover-confirmer.service';
import { HandoverCaseFacts } from './handover-case-facts.service';
import { HandoverIssueService } from './handover-issue.service';
import { HandoverRepo } from './handover.repo';

/**
 * What is left of the duties of the handover after `QĐ-110g` (the confirmation is gone): a planned departure still opens them when it
 * is recorded until the personnel side stops (X-H.2), and the reads show what stands. No revocation opens a duty any more. A change
 * or a cancellation of the case moves or cancels the duties still waiting, and a confirmed duty stays as history.
 */
@Injectable()
export class HandoverService {
  constructor(
    private readonly issue: HandoverIssueService,
    private readonly repo: HandoverRepo,
    private readonly view: RevocationViewService,
    private readonly facts: HandoverCaseFacts,
    private readonly audit: AuditApi,
    private readonly resolver: HandoverConfirmerResolver,
  ) {}

  /** Where the handover confirmation of each seat stands, in one read of the duties and one of the organization. */
  async briefsOf(assignmentIds: readonly string[], tx?: DbTx): Promise<HandoverDutyBrief[]> {
    const duties = await this.repo.latestOfAssignments(assignmentIds, tx);
    const today = await this.facts.today(new Date(), tx);
    const resolved = await this.resolver.resolve(duties, today, tx);

    return duties.map((duty) => {
      const status = duty.cancelledAt ? 'CANCELLED' : duty.confirmedAt ? 'CONFIRMED' : 'OPEN';
      const confirmer = resolved.get(duty.id)?.confirmer;

      return {
        dutyId: duty.id,
        assignmentId: duty.assignmentId,
        status,
        role: duty.confirmerRole,
        confirmerEmployeeId: confirmer?.employeeId ?? null,
        waitingReason: status === 'OPEN' ? (confirmer?.waiting ?? null) : null,
        dueOn: duty.dueOn,
        overdue: status === 'OPEN' && isOverdue(duty.dueOn, today),
        flaggedUnconfirmed: duty.proceededUnconfirmedAt !== null,
      };
    });
  }

  /**
   * Opens a duty for each personal seat the person holds, in the transaction of the case that decided they leave. A seat with a
   * duty waiting, or with a confirmation that answers it, gets no second one. Never creates or completes a revocation task.
   */
  async open(tx: DbTx, actor: AuthenticatedPrincipal, input: OpenHandoverDutiesInput): Promise<OpenedHandoverDuties> {
    const today = await this.facts.today(input.now ?? new Date(), tx);
    const departmentId = input.departmentId ?? (await this.facts.departmentOf(input.leaverEmployeeId, today, tx));
    const seats = await this.view.personalSeatsOf(input.leaverEmployeeId, today, tx);
    const result: OpenedHandoverDuties = { opened: [], reused: 0, notRequired: 0 };

    for (const seat of seats) {
      const issued = await this.issue.ensure(tx, actor, {
        assignmentId: seat.assignmentId,
        employeeId: input.leaverEmployeeId,
        facts: [{ source: input.source, decidedByEmployeeId: null }],
        dataLossOnRemoval: seat.dataLossOnRemoval,
        noticeText: seat.revocationNote,
        caseRefId: input.caseRefId,
        departmentId,
        leaverIsHead: input.leaverIsHead,
        resolveOn: input.leaverIsHead ? addDays(input.lastWorkingDay, 1) : null,
        dueOn: input.dueOn,
        operator: input.operator,
      });
      if (issued.outcome === 'OPENED') result.opened.push({ dutyId: issued.duty.id, assignmentId: seat.assignmentId });
      else if (issued.outcome === 'REUSED') result.reused += 1;
      else result.notRequired += 1;
    }

    return result;
  }

  /** The deadline of the case moved: the duties still waiting get the new one, and the reminder starts over (`US-03-04` AC-14). */
  async reconcile(tx: DbTx, actor: AuthenticatedPrincipal, input: ReconcileHandoverInput): Promise<number> {
    const duties = await this.repo.lockOpenOfCase(tx, input.caseRefId);
    for (const duty of duties) {
      const resolveOn =
        input.lastWorkingDay === undefined ? undefined : duty.leaverIsHead ? addDays(input.lastWorkingDay, 1) : null;
      await this.repo.setDue(tx, duty.id, input.dueOn, resolveOn);
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          duty.organizationId,
          'HANDOVER_DUTY.DUE_CHANGED',
          'HandoverDuty',
          duty.id,
          { dueOn: duty.dueOn },
          { dueOn: input.dueOn, caseRefId: input.caseRefId },
          input.operator,
        ),
      );
    }

    return duties.length;
  }

  /** The case was cancelled: the duties still waiting are cancelled with the reason, the confirmed ones stay (`US-03-04` AC-15). */
  async cancelByCase(tx: DbTx, actor: AuthenticatedPrincipal, input: CancelHandoverInput): Promise<number> {
    const duties = await this.repo.lockOpenOfCase(tx, input.caseRefId);
    const at = input.now ?? new Date();
    for (const duty of duties) {
      await this.repo.cancel(tx, duty.id, input.reason.trim(), at);
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          duty.organizationId,
          'HANDOVER_DUTY.CANCELLED',
          'HandoverDuty',
          duty.id,
          { dueOn: duty.dueOn },
          { caseRefId: input.caseRefId, assignmentId: duty.assignmentId },
          input.operator,
        ),
      );
    }

    return duties.length;
  }
}
