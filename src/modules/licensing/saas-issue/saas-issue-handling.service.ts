import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
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
import { SaasIssueNotifier } from './saas-issue-notifier.service';

export interface TransitionInput {
  to: SaasIssueState;
  message: string | null;
  resolution: string | null;
  vendorTicketRef: string | null;
  linkedWork: LinkedWork | null;
}

const blankToNull = (text: string | null): string | null => (text && text.trim() !== '' ? text.trim() : null);

/**
 * The handling of a report by an acting IT Admin of the reporter’s work department: the states it moves through, the result, the
 * vendor ticket typed by hand, the pointers to other work, and the marking of a duplicate. Only an acting IT Admin for the
 * reporter’s work department (appointed substitute if usable, otherwise the one in charge when usable) may handle an assigned
 * report; when the actor is a substitute or differs from the assigned IT Admin, the record names who acted on whose behalf. The
 * vendor ticket is only a text kept as written: nothing is sent to the vendor, and a pointer to a retry, a discrepancy, a return
 * or a request opens none of them. Throws SaasIssueError.
 */
@Injectable()
export class SaasIssueHandlingService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly calendar: SaasIssueCalendar,
    private readonly issues: SaasIssueRepo,
    private readonly facts: SaasIssueFactsRepo,
    private readonly audit: AuditApi,
    private readonly notifier: SaasIssueNotifier,
  ) {}

  async transition(actor: AuthenticatedPrincipal, id: string, input: TransitionInput): Promise<SaasIssueRecord> {
    const today = await this.organizationReads.businessToday();
    const reopenUntil = input.to === 'RESOLVED' ? await this.calendar.reopenUntil(today) : null;

    return this.runner.run(async (tx) => {
      const issue = await this.issues.lock(tx, id);
      if (!issue) throw new SaasIssueError('NOT_FOUND');
      const { bySubstitute, onBehalfOf } = await this.assertActingItAdmin(tx, actor, issue, today);
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
      const entry = await this.issues.insertEntry(tx, {
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
            ...(bySubstitute ? { bySubstitute: true } : {}),
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
              ...(bySubstitute ? { bySubstitute: true } : {}),
              reopenUntil: updated.reopenUntil,
            },
          ),
        );
      }

      await this.notifier.stateChanged(tx, issue, entry, 'IT_ACTION', actor.employeeId);

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
      const { primary: issue, other: original } = await this.lockPair(tx, id, input.ofIssueId);
      if (!issue) throw new SaasIssueError('NOT_FOUND');
      const today = await this.organizationReads.businessToday(new Date(), tx);
      const { bySubstitute, onBehalfOf } = await this.assertActingItAdmin(tx, actor, issue, today);
      const targetRefusal = duplicateTargetProblem({ issueId: id, original });
      if (targetRefusal) throw new SaasIssueError(targetRefusal);
      if (!canMove(issue.state, 'DUPLICATE')) throw new SaasIssueError('INVALID_TRANSITION');

      const updated = await this.issues.update(tx, id, {
        state: 'DUPLICATE',
        duplicateOfId: input.ofIssueId,
        duplicateReason: reason,
      });
      const entry = await this.issues.insertEntry(tx, {
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
            ...(bySubstitute ? { bySubstitute: true } : {}),
            reporterEmployeeId: issue.reporterEmployeeId,
          },
        ),
      );

      await this.notifier.stateChanged(tx, issue, entry, 'IT_ACTION', actor.employeeId);

      return updated;
    });
  }

  private async assertActingItAdmin(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    issue: SaasIssueRecord,
    today: BusinessDate,
  ): Promise<{ bySubstitute: boolean; onBehalfOf: string | null }> {
    if (issue.assignedItAdminEmployeeId === null) throw new SaasIssueError('NOT_IN_CHARGE');
    const departmentId =
      (await this.organizationReads.workDepartmentsOf([issue.reporterEmployeeId], today, tx)).get(
        issue.reporterEmployeeId,
      ) ?? null;
    if (departmentId === null) throw new SaasIssueError('NOT_IN_CHARGE');
    const acting = (
      await this.organizationReads.itAdminsActingFor(
        [departmentId],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      )
    ).get(departmentId);
    if (!acting || !acting.actors.includes(actor.employeeId)) throw new SaasIssueError('NOT_IN_CHARGE');

    const bySubstitute = acting.substitute === actor.employeeId;
    const onBehalfOf = bySubstitute
      ? (acting.inCharge ??
        (issue.assignedItAdminEmployeeId !== actor.employeeId ? issue.assignedItAdminEmployeeId : null))
      : actor.employeeId === issue.assignedItAdminEmployeeId
        ? null
        : issue.assignedItAdminEmployeeId;

    return { bySubstitute, onBehalfOf };
  }

  private async lockPair(
    tx: DbTx,
    primaryId: string,
    otherId: string,
  ): Promise<{ primary: SaasIssueRecord | null; other: SaasIssueRecord | null }> {
    // The two reports are locked in the order of their ids, so two that are marked duplicates of each other meet one after the other.
    const first = primaryId < otherId ? primaryId : otherId;
    const second = primaryId < otherId ? otherId : primaryId;
    const locked = new Map<string, SaasIssueRecord | null>();
    locked.set(first, await this.issues.lock(tx, first));
    if (second !== first) locked.set(second, await this.issues.lock(tx, second));

    return { primary: locked.get(primaryId) ?? null, other: locked.get(otherId) ?? null };
  }
}
