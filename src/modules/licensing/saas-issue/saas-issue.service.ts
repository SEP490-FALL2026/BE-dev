import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { licensingAuditEvent } from '../mappers/licensing-audit-event.mapper';
import { SaasIssueError } from './saas-issue.errors';
import {
  assignmentProblem,
  assigneeOf,
  messageProblem,
  occurredProblem,
  reopenProblem,
  type SaasIssueCategory,
  type SaasIssueImpact,
} from './saas-issue.policy';
import { SaasIssueFactsRepo } from './saas-issue-facts.repo';
import { SaasIssueRepo, type AuthorRole, type SaasIssueRecord } from './saas-issue.repo';
import { SaasIssueCalendar } from './saas-issue-calendar.service';

export interface SubmitIssueInput {
  assignmentId: string;
  category: SaasIssueCategory;
  impact: SaasIssueImpact;
  description: string;
  occurredAt: Date;
}

/**
 * The report of an error in a SaaS right and what the reporter does with it afterwards (`US-07-10`): sending it for a right that is
 * theirs, adding to it, reopening it in time. The report is given to exactly one IT Admin when it is made (the one in charge of the
 * department of the reporter when they can act, else the first who can) and the day it should be taken up by is fixed then. Nothing
 * about the assignment, the grant task or a request is changed and nothing is sent to the vendor. Throws SaasIssueError.
 */
@Injectable()
export class SaasIssueService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly identity: IdentityAccessApi,
    private readonly calendar: SaasIssueCalendar,
    private readonly issues: SaasIssueRepo,
    private readonly facts: SaasIssueFactsRepo,
    private readonly audit: AuditApi,
  ) {}

  async submit(actor: AuthenticatedPrincipal, input: SubmitIssueInput): Promise<SaasIssueRecord> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A SaaS issue was sent before installation');
    const problem = occurredProblem(input.occurredAt, new Date());
    if (problem) throw new SaasIssueError(problem);
    const today = await this.organization.businessToday();
    const responseDueOn = await this.calendar.responseDueOn(today);

    return this.runner.run(async (tx) => {
      const facts = await this.facts.assignmentFacts(tx, input.assignmentId);
      const refusal = assignmentProblem({
        assignment: facts?.assignment ?? null,
        actorEmployeeId: actor.employeeId,
        today,
      });
      if (refusal || !facts) throw new SaasIssueError(refusal ?? 'ASSIGNMENT_NOT_YOURS');
      const assignee = await this.assigneeFor(tx, actor.employeeId, today);
      if (!assignee) throw new SaasIssueError('NO_IT_ADMIN');

      const issue = await this.issues.insert(tx, await this.issues.nextCode(tx, today.slice(0, 4)), {
        organizationId: organization.id,
        reporterEmployeeId: actor.employeeId,
        assignmentId: input.assignmentId,
        grantTaskId: facts.grantTaskId,
        category: input.category,
        impact: input.impact,
        description: input.description.trim(),
        occurredAt: input.occurredAt,
        assignedItAdminEmployeeId: assignee.employeeId,
        assignedByFallback: assignee.byFallback,
        responseDueOn,
      });
      // The description is free text a person may have put a secret in: the event keeps what it is about, not what was written.
      await this.audit.record(
        tx,
        licensingAuditEvent(actor, organization.id, 'SAAS_ISSUE.SUBMITTED', 'SaasIssue', issue.id, null, {
          code: issue.code,
          reporterEmployeeId: issue.reporterEmployeeId,
          assignmentId: issue.assignmentId,
          planId: facts.planId,
          grantTaskId: issue.grantTaskId,
          category: issue.category,
          impact: issue.impact,
          occurredAt: issue.occurredAt.toISOString(),
          assignedItAdminEmployeeId: issue.assignedItAdminEmployeeId,
          assignedByFallback: issue.assignedByFallback,
          responseDueOn: issue.responseDueOn,
        }),
      );

      return issue;
    });
  }

  /**
   * Says more on a report: the reporter, or an IT Admin. A reply of the reporter to a question brings a report that waits for them back
   * to being handled, and the event names the IT Admin it is for. Nothing is added to a report that is closed or a duplicate.
   */
  async addMessage(actor: AuthenticatedPrincipal, id: string, body: string): Promise<SaasIssueRecord> {
    return this.runner.run(async (tx) => {
      const issue = await this.issues.lock(tx, id);
      const role = issue ? authorRoleOf(actor, issue) : null;
      if (!issue || !role) throw new SaasIssueError('NOT_FOUND');
      const text = body.trim();
      if (text === '') throw new SaasIssueError('MESSAGE_REQUIRED');
      const closed = messageProblem(issue.state);
      if (closed) throw new SaasIssueError(closed);

      const resumes = role === 'REPORTER' && issue.state === 'WAITING_REPORTER';
      const updated = resumes ? await this.issues.update(tx, id, { state: 'IN_PROGRESS' }) : issue;
      await this.issues.insertEntry(tx, {
        issueId: id,
        kind: resumes ? 'TRANSITION' : 'MESSAGE',
        authorEmployeeId: actor.employeeId,
        authorRole: role,
        body: text,
        fromState: resumes ? issue.state : null,
        toState: resumes ? 'IN_PROGRESS' : null,
        onBehalfOfEmployeeId: null,
      });
      await this.audit.record(
        tx,
        licensingAuditEvent(actor, issue.organizationId, 'SAAS_ISSUE.MESSAGE_ADDED', 'SaasIssue', id, null, {
          code: issue.code,
          authorRole: role,
          state: updated.state,
          resumed: resumes,
          // Who the exchange is for: the IT Admin when the reporter wrote, the reporter when an IT Admin did.
          notifyEmployeeId: role === 'REPORTER' ? issue.assignedItAdminEmployeeId : issue.reporterEmployeeId,
        }),
      );
      if (resumes) {
        await this.audit.record(
          tx,
          licensingAuditEvent(
            actor,
            issue.organizationId,
            'SAAS_ISSUE.TRANSITIONED',
            'SaasIssue',
            id,
            { state: issue.state },
            { state: 'IN_PROGRESS', trigger: 'REPORTER_REPLY', notifyEmployeeId: issue.assignedItAdminEmployeeId },
          ),
        );
      }

      return updated;
    });
  }

  /** The reporter reopens a resolved report with the reason, no later than the last day fixed when it was resolved. */
  async reopen(actor: AuthenticatedPrincipal, id: string, reason: string): Promise<SaasIssueRecord> {
    const today = await this.organization.businessToday();

    return this.runner.run(async (tx) => {
      const issue = await this.issues.lock(tx, id);
      if (!issue || issue.reporterEmployeeId !== actor.employeeId) throw new SaasIssueError('NOT_FOUND');
      const text = reason.trim();
      if (text === '') throw new SaasIssueError('REASON_REQUIRED');
      const refusal = reopenProblem({ state: issue.state, reopenUntil: issue.reopenUntil, today });
      if (refusal) throw new SaasIssueError(refusal);

      const updated = await this.issues.update(tx, id, { state: 'IN_PROGRESS', reopenCount: issue.reopenCount + 1 });
      await this.issues.insertEntry(tx, {
        issueId: id,
        kind: 'TRANSITION',
        authorEmployeeId: actor.employeeId,
        authorRole: 'REPORTER',
        body: text,
        fromState: 'RESOLVED',
        toState: 'IN_PROGRESS',
        onBehalfOfEmployeeId: null,
      });
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          issue.organizationId,
          'SAAS_ISSUE.REOPENED',
          'SaasIssue',
          id,
          { state: 'RESOLVED' },
          {
            state: 'IN_PROGRESS',
            code: issue.code,
            reopenCount: updated.reopenCount,
            notifyEmployeeId: issue.assignedItAdminEmployeeId,
          },
        ),
      );

      return updated;
    });
  }

  /** The IT Admin in charge of the department of the reporter when they can act, else the first IT Admin who can. */
  private async assigneeFor(tx: DbTx, reporterEmployeeId: string, today: string) {
    const inCharge =
      (await this.organization.getItAdminInCharge(reporterEmployeeId, today, tx))?.itAdminEmployeeId ?? null;
    const usable = inCharge ? (await this.identity.findUsableItAdminEmployeeIds([inCharge])).has(inCharge) : false;

    return assigneeOf({
      inChargeEmployeeId: inCharge,
      inChargeUsable: usable,
      fallbackEmployeeId: usable ? null : await this.identity.findFirstUsableItAdminEmployeeId(tx),
    });
  }
}

/** Who speaks: the reporter on their own report, or an IT Admin; anyone else has no such report. */
function authorRoleOf(actor: AuthenticatedPrincipal, issue: SaasIssueRecord): AuthorRole | null {
  if (actor.employeeId === issue.reporterEmployeeId) return 'REPORTER';

  return actor.roles.includes('IT_ADMIN') ? 'IT_ADMIN' : null;
}
