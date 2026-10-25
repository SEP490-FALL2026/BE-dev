import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { licensingAuditEvent } from '../mappers/licensing-audit-event';
import { SaasIssueError } from './saas-issue.errors';
import {
  canMove,
  duplicateTargetProblem,
  transitionProblem,
  type LinkedWork,
  type SaasIssueState,
} from './saas-issue.policy';
import { SaasIssueFactsRepo } from './saas-issue-facts.repo';
import { SaasIssueRepo, type IssuePatch, type SaasIssueRecord } from './saas-issue.repo';
import { SaasIssueCalendar } from './saas-issue-calendar.service';

export interface TransitionInput {
  to: SaasIssueState;
  message: string | null;
  resolution: string | null;
  vendorTicketRef: string | null;
  linkedWork: LinkedWork | null;
}

const blankToNull = (text: string | null): string | null => (text && text.trim() !== '' ? text.trim() : null);

/**
 * The handling of a report by an IT Admin (`US-07-11`): the states it moves through, the result, the vendor ticket typed by hand, the
 * pointers to other work, and the marking of a duplicate. Any IT Admin may handle a report; when it is not the one it was given to, the
 * event names both. The vendor ticket is only a text kept as written: nothing is sent to the vendor, and a pointer to a retry, a
 * discrepancy, a return or a request opens none of them. Throws SaasIssueError.
 */
@Injectable()
export class SaasIssueHandlingService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationService,
    private readonly calendar: SaasIssueCalendar,
    private readonly issues: SaasIssueRepo,
    private readonly facts: SaasIssueFactsRepo,
    private readonly audit: AuditService,
  ) {}

  async transition(actor: AuthenticatedPrincipal, id: string, input: TransitionInput): Promise<SaasIssueRecord> {
    const today = await this.organization.businessToday();
    const reopenUntil = input.to === 'RESOLVED' ? await this.calendar.reopenUntil(today) : null;

    return this.runner.run(async (tx) => {
      const issue = await this.issues.lock(tx, id);
      if (!issue) throw new SaasIssueError('NOT_FOUND');
      const message = blankToNull(input.message);
      const resolution = blankToNull(input.resolution);
      const refusal = transitionProblem({ from: issue.state, to: input.to, message, resolution });
      if (refusal) throw new SaasIssueError(refusal);
      const taskId = input.linkedWork?.grantTaskId;
      if (taskId && !(await this.facts.grantTaskExists(taskId, tx))) {
        throw new SaasIssueError('LINKED_WORK_INVALID', 'GRANT_TASK_NOT_FOUND');
      }

      const now = new Date();
      const patch: IssuePatch = {
        state: input.to,
        ...(blankToNull(input.vendorTicketRef)
          ? { vendorTicketRef: blankToNull(input.vendorTicketRef) as string }
          : {}),
        ...(input.linkedWork && Object.keys(input.linkedWork).length > 0 ? { linkedWork: input.linkedWork } : {}),
        ...(input.to === 'RESOLVED' && resolution && reopenUntil ? { resolution, resolvedAt: now, reopenUntil } : {}),
      };
      const updated = await this.issues.update(tx, id, patch);
      const onBehalfOf = actor.employeeId === issue.assignedItAdminEmployeeId ? null : issue.assignedItAdminEmployeeId;
      await this.issues.insertEntry(tx, {
        issueId: id,
        kind: 'TRANSITION',
        authorEmployeeId: actor.employeeId,
        authorRole: 'IT_ADMIN',
        body: message ?? (input.to === 'RESOLVED' ? resolution : null),
        fromState: issue.state,
        toState: input.to,
        onBehalfOfEmployeeId: onBehalfOf,
      });
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          issue.organizationId,
          'SAAS_ISSUE.TRANSITIONED',
          'SaasIssue',
          id,
          { state: issue.state },
          {
            state: input.to,
            code: issue.code,
            onBehalfOf,
            reporterEmployeeId: issue.reporterEmployeeId,
            vendorTicketRefGiven: patch.vendorTicketRef !== undefined,
            linkedWork: patch.linkedWork ? { ...patch.linkedWork } : null,
          },
        ),
      );
      if (input.to === 'RESOLVED') {
        // The point the reporter is told the result from; the result itself is read through the report.
        await this.audit.record(
          tx,
          licensingAuditEvent(
            actor,
            issue.organizationId,
            'SAAS_ISSUE.RESOLVED',
            'SaasIssue',
            id,
            { state: issue.state },
            {
              code: issue.code,
              notifyEmployeeId: issue.reporterEmployeeId,
              onBehalfOf,
              reopenUntil: updated.reopenUntil,
            },
          ),
        );
      }

      return updated;
    });
  }

  /** Marks a report a duplicate of another, with the reason; both are required and nothing is written without them. */
  async markDuplicate(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { ofIssueId: string; reason: string },
  ): Promise<SaasIssueRecord> {
    const reason = input.reason.trim();
    if (reason === '') throw new SaasIssueError('REASON_REQUIRED');

    return this.runner.run(async (tx) => {
      // The two reports are locked in the order of their ids, so two that are marked duplicates of each other meet one after the other.
      const first = id < input.ofIssueId ? id : input.ofIssueId;
      const second = id < input.ofIssueId ? input.ofIssueId : id;
      const locked = new Map<string, SaasIssueRecord | null>();
      locked.set(first, await this.issues.lock(tx, first));
      if (second !== first) locked.set(second, await this.issues.lock(tx, second));
      const issue = locked.get(id) ?? null;
      if (!issue) throw new SaasIssueError('NOT_FOUND');
      const targetRefusal = duplicateTargetProblem({
        issueId: id,
        original: locked.get(input.ofIssueId) ?? null,
      });
      if (targetRefusal) throw new SaasIssueError(targetRefusal);
      if (!canMove(issue.state, 'DUPLICATE')) throw new SaasIssueError('INVALID_TRANSITION');

      const updated = await this.issues.update(tx, id, {
        state: 'DUPLICATE',
        duplicateOfId: input.ofIssueId,
        duplicateReason: reason,
      });
      const onBehalfOf = actor.employeeId === issue.assignedItAdminEmployeeId ? null : issue.assignedItAdminEmployeeId;
      await this.issues.insertEntry(tx, {
        issueId: id,
        kind: 'TRANSITION',
        authorEmployeeId: actor.employeeId,
        authorRole: 'IT_ADMIN',
        body: reason,
        fromState: issue.state,
        toState: 'DUPLICATE',
        onBehalfOfEmployeeId: onBehalfOf,
      });
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          issue.organizationId,
          'SAAS_ISSUE.DUPLICATED',
          'SaasIssue',
          id,
          { state: issue.state },
          {
            state: 'DUPLICATE',
            code: issue.code,
            ofIssueId: input.ofIssueId,
            onBehalfOf,
            reporterEmployeeId: issue.reporterEmployeeId,
          },
        ),
      );

      return updated;
    });
  }
}
