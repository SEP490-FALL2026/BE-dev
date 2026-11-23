import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import type { SaasIssueState } from './saas-issue.policy';
import type { EntryRecord, SaasIssueRecord } from './saas-issue.repo';

/** What moved a report to its new state, and so who is told of it. */
export type StateChangeTrigger = 'IT_ACTION' | 'REPORTER_REPLY' | 'REPORTER_REOPEN' | 'REOPEN_WINDOW_LAPSED';

/**
 * Tells of a report of an error in a SaaS right (`FR-2.15`, `QĐ-108f`): the IT Admin it is given to when it is sent, when its day to be
 * taken up passed (once) and when the reporter moves it back to being handled; the reporter when an IT Admin moves it and when the pass
 * closes it. Every notice is written in the transaction of the change it follows, so it exists exactly when that commits, and once for
 * each change however many times the report is looked at. They carry ids, the code of the report and the words of its kind or states,
 * and never what was written in it. The head of the department is told nothing: they do not read the report (`FR-2.15`).
 */
@Injectable()
export class SaasIssueNotifier {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly catalog: CatalogApi,
  ) {}

  /**
   * The IT Admin it is given to, unless it is they who made it: nobody is told of what they did themselves. A report that fell to an
   * appointed substitute is told to that substitute.
   */
  async submitted(tx: DbTx, issue: SaasIssueRecord, planId: string): Promise<void> {
    if (issue.assignedItAdminEmployeeId === null || issue.assignedItAdminEmployeeId === issue.reporterEmployeeId) {
      return;
    }
    const applicationId = await this.applicationIdOf(tx, planId);
    await this.notifications.notifyInApp(tx, {
      organizationId: issue.organizationId,
      recipientEmployeeId: issue.assignedItAdminEmployeeId,
      code: 'SAAS_ISSUE_SUBMITTED',
      subject: { type: 'SAAS_ISSUE', id: issue.id },
      params: {
        issueId: issue.id,
        issueCode: issue.code,
        category: issue.category,
        impact: issue.impact,
        applicationId,
      },
      eventKey: `SAAS_ISSUE_SUBMITTED:${issue.id}`,
    });
  }

  /** Tells the Super Admin once that a new report has no acting IT Admin in the reporter's department. */
  async awaitingAssignee(
    tx: DbTx,
    issue: SaasIssueRecord,
    planId: string,
    departmentId: string | null,
    superAdminEmployeeId: string,
  ): Promise<void> {
    const applicationId = await this.applicationIdOf(tx, planId);
    await this.notifications.notifyInApp(tx, {
      organizationId: issue.organizationId,
      recipientEmployeeId: superAdminEmployeeId,
      code: 'SAAS_ISSUE_AWAITING_ASSIGNEE',
      subject: { type: 'SAAS_ISSUE', id: issue.id },
      params: {
        issueId: issue.id,
        issueCode: issue.code,
        category: issue.category,
        impact: issue.impact,
        applicationId,
        departmentId,
      },
      eventKey: `saasIssueAwaitingAssignee:${issue.id}`,
    });
  }

  /** The assignee (or the Super Admin when still unassigned), once: the pass marks the report as told in the same transaction. */
  async responseOverdue(
    tx: DbTx,
    issue: SaasIssueRecord,
    recipientEmployeeId: string | null = issue.assignedItAdminEmployeeId,
  ): Promise<void> {
    if (recipientEmployeeId === null) return;
    await this.notifications.notifyInApp(tx, {
      organizationId: issue.organizationId,
      recipientEmployeeId,
      code: 'SAAS_ISSUE_RESPONSE_OVERDUE',
      subject: { type: 'SAAS_ISSUE', id: issue.id },
      params: { issueId: issue.id, issueCode: issue.code, responseDueOn: issue.responseDueOn },
      eventKey: `SAAS_ISSUE_RESPONSE_OVERDUE:${issue.id}`,
    });
  }

  /**
   * A change of state, told to the other party: the reporter when an IT Admin moved the report, the IT Admin it is given to (also by
   * the fallback) when the reporter answered a question or reopened it. Nobody is told of what they did themselves: an IT Admin who
   * handles their own report, or a reporter who is the IT Admin it was given to, gets nothing. `entry` is the line of the history the
   * change was written as; it is the key of the notice.
   */
  async stateChanged(
    tx: DbTx,
    issue: SaasIssueRecord,
    entry: EntryRecord,
    trigger: Exclude<StateChangeTrigger, 'REOPEN_WINDOW_LAPSED'>,
    actorEmployeeId: string,
  ): Promise<void> {
    const recipient = trigger === 'IT_ACTION' ? issue.reporterEmployeeId : issue.assignedItAdminEmployeeId;
    if (recipient === null || recipient === actorEmployeeId) return;
    if (!entry.fromState || !entry.toState)
      throw new Error('A change of state of a SaaS issue was written without its states');
    await this.sendStateChanged(tx, issue, recipient, entry.fromState, entry.toState, trigger, entry.id);
  }

  private async applicationIdOf(tx: DbTx, planId: string): Promise<string> {
    const [plan] = await this.catalog.getPlanSummaries([planId], tx);
    if (!plan) throw new Error('A SaaS issue was sent for a right of a plan that does not exist');

    return plan.applicationId;
  }

  /** The reporter, once, when the pass closes a resolved report whose last day to reopen it passed: no one made this change. */
  async reopenWindowLapsed(tx: DbTx, issue: SaasIssueRecord): Promise<void> {
    await this.sendStateChanged(
      tx,
      issue,
      issue.reporterEmployeeId,
      'RESOLVED',
      'CLOSED',
      'REOPEN_WINDOW_LAPSED',
      `${issue.id}:CLOSED`,
    );
  }

  private async sendStateChanged(
    tx: DbTx,
    issue: SaasIssueRecord,
    recipientEmployeeId: string,
    fromState: SaasIssueState,
    toState: SaasIssueState,
    trigger: StateChangeTrigger,
    eventSuffix: string,
  ): Promise<void> {
    await this.notifications.notifyInApp(tx, {
      organizationId: issue.organizationId,
      recipientEmployeeId,
      code: 'SAAS_ISSUE_STATE_CHANGED',
      subject: { type: 'SAAS_ISSUE', id: issue.id },
      params: { issueId: issue.id, issueCode: issue.code, fromState, toState, trigger },
      eventKey: `SAAS_ISSUE_STATE_CHANGED:${eventSuffix}`,
    });
  }
}
