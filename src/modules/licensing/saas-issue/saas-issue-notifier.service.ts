import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import type { SaasIssueRecord } from './saas-issue.repo';

/**
 * Tells the IT Admin a report of an error in a SaaS right is given to (`FR-2.15`, `QĐ-108f`): when it is sent and, once, when its day to
 * be taken up passed. Both notices are written in the transaction of the change they follow, so they exist exactly when it commits, and
 * once for each report however many times it is looked at. They carry ids, the code of the report and the words of its kind, and never what
 * was written in it. The head of the department is told nothing: they do not read the report (`FR-2.15`).
 */
@Injectable()
export class SaasIssueNotifier {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly catalog: CatalogApi,
  ) {}

  /**
   * The IT Admin it is given to, unless it is they who made it: nobody is told of what they did themselves. A report that fell to the
   * first IT Admin who can act (nobody in charge, or the one in charge cannot) is told to that one.
   */
  async submitted(tx: DbTx, issue: SaasIssueRecord, planId: string): Promise<void> {
    if (issue.assignedItAdminEmployeeId === issue.reporterEmployeeId) return;
    const [plan] = await this.catalog.getPlanSummaries([planId], tx);
    if (!plan) throw new Error('A SaaS issue was sent for a right of a plan that does not exist');
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
        applicationId: plan.applicationId,
      },
      eventKey: `SAAS_ISSUE_SUBMITTED:${issue.id}`,
    });
  }

  /** The IT Admin it is given to, once: the pass marks the report as told in the same transaction. */
  async responseOverdue(tx: DbTx, issue: SaasIssueRecord): Promise<void> {
    await this.notifications.notifyInApp(tx, {
      organizationId: issue.organizationId,
      recipientEmployeeId: issue.assignedItAdminEmployeeId,
      code: 'SAAS_ISSUE_RESPONSE_OVERDUE',
      subject: { type: 'SAAS_ISSUE', id: issue.id },
      params: { issueId: issue.id, issueCode: issue.code, responseDueOn: issue.responseDueOn },
      eventKey: `SAAS_ISSUE_RESPONSE_OVERDUE:${issue.id}`,
    });
  }
}
