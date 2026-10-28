import { Injectable } from '@nestjs/common';
import { addDays } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/catalog.service';
import { SeatTargetNotFoundError } from '../licensing.errors';
import type {
  CancelHandoverInput,
  HandoverDutyBrief,
  OpenedHandoverDuties,
  OpenHandoverDutiesInput,
  ReconcileHandoverInput,
} from '../licensing-handover.types';
import type { RevocationContext, RevocationReasonFacts, RevocationTaskFacts } from '../licensing.types';
import { licensingAuditEvent } from '../mappers/licensing-audit-event';
import { RevocationReadService } from '../provisioning/revocation-read.service';
import { isOverdue, requirementOf } from './handover-confirmer.policy';
import { HandoverConfirmerResolver } from './handover-confirmer.resolver';
import { HandoverCaseFacts } from './handover-case-facts.service';
import { HandoverIssueService } from './handover-issue.service';
import { HandoverRepo } from './handover.repo';

/** The sources a person who leaves opens: the one who leaves is not who confirms. */
const DEPARTING: ReadonlySet<string> = new Set(['DEPARTURE', 'ABRUPT_DEPARTURE']);
/**
 * The record of a return keeps its own light handover (`g5-return-and-renewal-requests`): the gate is not asked a second time for
 * a reason that comes from it.
 */
const RETURN_RECORD = 'RETURN_REQUEST';

/**
 * Opens, moves and cancels the duties of the handover (`US-03-09`, `US-07-09`). A planned departure opens them for every seat the
 * person holds as soon as it is recorded, before any task exists, with the deadline its source worked out; every other source
 * opens them through the hook when its revocation opens, with a short deadline counted here. A change or a cancellation of the
 * case moves or cancels the duties still waiting, and a confirmed duty stays as history.
 */
@Injectable()
export class HandoverService {
  constructor(
    private readonly issue: HandoverIssueService,
    private readonly repo: HandoverRepo,
    private readonly reads: RevocationReadService,
    private readonly catalog: CatalogService,
    private readonly facts: HandoverCaseFacts,
    private readonly audit: AuditService,
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
    const seats = await this.reads.personalSeatsOf(input.leaverEmployeeId, today, tx);
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

  /** The hook of the revocation: a task was opened or a reason added to it, so the seat may owe a confirmation. */
  async openFromTask(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    task: RevocationTaskFacts,
    reasons: readonly RevocationReasonFacts[],
    context: RevocationContext,
    now: Date,
  ): Promise<void> {
    const asked = reasons
      .filter((reason) => reason.referenceKind !== RETURN_RECORD)
      .map((reason) => ({ source: reason.source, decidedByEmployeeId: reason.decidedByEmployeeId }));
    const [plan] = await this.catalog.getPlanRevocationInfo([task.planId], tx);
    if (!plan) throw new SeatTargetNotFoundError('PLAN');
    const required = requirementOf(asked, plan.dataLossOnRemoval);
    if (!required) return;

    const today = await this.facts.today(now, tx);
    const departmentId = context.departmentId ?? (await this.facts.departmentOf(task.employeeId, today, tx));
    // The person who leaves heads the department: a successor is looked for from tomorrow, never the person themselves.
    const leaverIsHead =
      DEPARTING.has(required.source) &&
      departmentId !== null &&
      (await this.facts.heads(task.employeeId, departmentId, today, tx));

    await this.issue.ensure(tx, actor, {
      assignmentId: task.assignmentId,
      employeeId: task.employeeId,
      facts: asked,
      dataLossOnRemoval: plan.dataLossOnRemoval,
      noticeText: context.noticeText ?? plan.revocationNote,
      caseRefId: null,
      departmentId,
      leaverIsHead,
      resolveOn: leaverIsHead ? addDays(today, 1) : null,
      dueOn: context.dueOn ?? (await this.facts.dueFor(required.source, today)),
    });
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
