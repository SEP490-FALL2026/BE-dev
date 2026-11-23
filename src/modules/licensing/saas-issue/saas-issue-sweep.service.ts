import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { isReopenLapsed } from './saas-issue.policy';
import { SaasIssueFactsRepo } from './saas-issue-facts.repo';
import { SaasIssueNotifier } from './saas-issue-notifier.service';
import { SaasIssueRepo, type SaasIssueRecord } from './saas-issue.repo';
import { resolveDepartmentAssignee } from './saas-issue.service';

/** How many reports one pass looks at in each of its parts; the next pass takes the rest. */
const BATCH = 200;

/**
 * What the hourly pass does about reports: assigns unassigned new reports when an acting IT Admin becomes available for the
 * reporter's department, closes resolved reports whose reopen window has lapsed, and notifies once for each new report whose
 * response due date has passed (to the assigned IT Admin, or to the Super Admin while still unassigned). Each mark and its
 * event are written together under lock, so a report is handled once however many instances run the pass.
 */
@Injectable()
export class SaasIssueSweepService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly issues: SaasIssueRepo,
    private readonly facts: SaasIssueFactsRepo,
    private readonly audit: AuditApi,
    private readonly notifier: SaasIssueNotifier,
  ) {}

  /** Runs all three passes as of `now`; returns how many reports were assigned, closed, and reminded. */
  async run(now: Date = new Date()): Promise<{ assigned: number; closed: number; told: number }> {
    const today = await this.organizationReads.businessToday(now);
    const unassigned = await this.issues.listUnassigned(BATCH);
    let assigned = 0;
    for (const issue of unassigned) if (await this.assign(issue, now)) assigned += 1;
    const lapsed = await this.issues.listLapsed(today, BATCH);
    let closed = 0;
    for (const issue of lapsed) if (await this.close(issue, now)) closed += 1;
    const late = await this.issues.listOverdueUnnoticed(today, BATCH);
    let told = 0;
    for (const issue of late) if (await this.tell(issue)) told += 1;

    return { assigned, closed, told };
  }

  private assign(candidate: SaasIssueRecord, now: Date): Promise<boolean> {
    return this.runner.run(async (tx) => {
      const issue = await this.issues.lock(tx, candidate.id);
      if (!issue || issue.state !== 'NEW' || issue.assignedItAdminEmployeeId !== null) return false;
      const today = await this.organizationReads.businessToday(now, tx);
      const { assignee } = await resolveDepartmentAssignee(
        this.organizationReads,
        this.identity,
        tx,
        issue.reporterEmployeeId,
        today,
      );
      if (assignee === null) return false;

      const updated = await this.issues.assignUnassigned(tx, issue.id, assignee);
      await this.audit.record(tx, {
        organizationId: issue.organizationId,
        actorKind: 'SYSTEM',
        action: 'SAAS_ISSUE.ASSIGNED',
        resourceType: 'SaasIssue',
        resourceId: issue.id,
        before: { assignedItAdminEmployeeId: null, assignedByFallback: false },
        after: {
          code: issue.code,
          assignedItAdminEmployeeId: updated.assignedItAdminEmployeeId,
          assignedByFallback: updated.assignedByFallback,
        },
        correlationId: issue.id,
      });
      const planId = (await this.facts.planIdsOf([issue.assignmentId], tx)).get(issue.assignmentId);
      if (planId) await this.notifier.submitted(tx, updated, planId);

      return true;
    });
  }

  private close(candidate: SaasIssueRecord, now: Date): Promise<boolean> {
    return this.runner.run(async (tx) => {
      const issue = await this.issues.lock(tx, candidate.id);
      const today = await this.organizationReads.businessToday(now, tx);
      if (!issue || !isReopenLapsed({ state: issue.state, reopenUntil: issue.reopenUntil, today })) return false;
      await this.issues.update(tx, issue.id, { state: 'CLOSED', closedAt: now });
      await this.issues.insertEntry(tx, {
        issueId: issue.id,
        kind: 'TRANSITION',
        authorEmployeeId: null,
        authorRole: 'SYSTEM',
        body: null,
        fromState: 'RESOLVED',
        toState: 'CLOSED',
        onBehalfOfEmployeeId: null,
      });
      await this.audit.record(tx, {
        organizationId: issue.organizationId,
        actorKind: 'SYSTEM',
        action: 'SAAS_ISSUE.CLOSED',
        resourceType: 'SaasIssue',
        resourceId: issue.id,
        before: { state: 'RESOLVED' },
        after: {
          state: 'CLOSED',
          code: issue.code,
          reporterEmployeeId: issue.reporterEmployeeId,
          reopenUntil: issue.reopenUntil,
        },
        correlationId: issue.id,
      });
      await this.notifier.reopenWindowLapsed(tx, issue);

      return true;
    });
  }

  private tell(candidate: SaasIssueRecord): Promise<boolean> {
    return this.runner.run(async (tx) => {
      const issue = await this.issues.lock(tx, candidate.id);
      if (!issue || issue.state !== 'NEW' || issue.responseOverdueNoticedAt !== null) return false;
      const recipientEmployeeId =
        issue.assignedItAdminEmployeeId ?? (await this.identity.findUsableSuperAdminEmployeeId(tx));
      if (recipientEmployeeId === null) return false;
      if (!(await this.issues.markOverdueNoticed(tx, issue.id))) return false;
      await this.audit.record(tx, {
        organizationId: issue.organizationId,
        actorKind: 'SYSTEM',
        action: 'SAAS_ISSUE.RESPONSE_OVERDUE',
        resourceType: 'SaasIssue',
        resourceId: issue.id,
        before: null,
        after: {
          code: issue.code,
          notifyEmployeeId: recipientEmployeeId,
          responseDueOn: issue.responseDueOn,
          state: issue.state,
        },
        correlationId: issue.id,
      });
      await this.notifier.responseOverdue(tx, issue, recipientEmployeeId);

      return true;
    });
  }
}
