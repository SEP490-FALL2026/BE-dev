import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { isReopenLapsed } from './saas-issue.policy';
import { SaasIssueRepo, type SaasIssueRecord } from './saas-issue.repo';

/** How many reports one pass looks at in each of its two parts; the next pass takes the rest. */
const BATCH = 200;

/**
 * What the hourly pass does about reports. It closes a resolved report whose last day to reopen has passed, and tells, once for each
 * new report, that its day to be taken up passed without anybody doing so (`US-07-11` AC-6): the audit event is the point the reminder
 * to the IT Admin it was given to is taken from. The reminder only tells. It never changes the person, the state or closes the report.
 * Each mark and its event are written together, so a report is told once however many instances run the pass.
 */
@Injectable()
export class SaasIssueSweepService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organizationReads: OrganizationReadApi,
    private readonly issues: SaasIssueRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Runs both parts as of `now`; returns how many reports were closed and how many were told about. */
  async run(now: Date = new Date()): Promise<{ closed: number; told: number }> {
    const today = await this.organizationReads.businessToday(now);
    const lapsed = await this.issues.listLapsed(today, BATCH);
    let closed = 0;
    for (const issue of lapsed) if (await this.close(issue, now)) closed += 1;
    const late = await this.issues.listOverdueUnnoticed(today, BATCH);
    let told = 0;
    for (const issue of late) if (await this.tell(issue)) told += 1;

    return { closed, told };
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

      return true;
    });
  }

  private tell(issue: SaasIssueRecord): Promise<boolean> {
    return this.runner.run(async (tx) => {
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
          notifyEmployeeId: issue.assignedItAdminEmployeeId,
          responseDueOn: issue.responseDueOn,
          state: issue.state,
        },
        correlationId: issue.id,
      });

      return true;
    });
  }
}
