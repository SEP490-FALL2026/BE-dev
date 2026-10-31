import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ControlledWaitRepo } from './controlled-wait.repo';
import { alertRecipientsOf, configurationHintOf, type ReassignableStepKind } from '../step-routing/reassignment.policy';
import { reassignmentAuditEvent } from './reassignment-audit.mapper';

/** A step that waits, as the alert is raised for it. */
export interface WaitingStep {
  organizationId: string;
  requestId: string;
  requesterEmployeeId: string;
  stepId: string;
  stepKind: ReassignableStepKind;
  waitingReason: string;
  /** When this stretch of waiting began: the key of the alert. */
  waitingSince: Date;
}

/**
 * The alert of a stretch of controlled waiting (`US-05-11` AC-1, AC-2, AC-6): once for each stretch however long it lasts,
 * naming what to configure and who is to be told. The row of `controlled_wait_alerts` and the audit event are written
 * together; a second call for the same stretch writes nothing, so a step that waits for thirty days is alerted once.
 *
 * Delivering the alert to the inbox of the people it names is for `g5-request-status-notifications`, which reads the audit
 * event `ACCESS_REQUEST.STEP_WAIT_ALERTED` written here; the queue `GET /controlled-waits` shows every step that waits.
 */
@Injectable()
export class ControlledWaitAlertService {
  constructor(
    private readonly alerts: ControlledWaitRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /** Raises the alert of the stretch if it was not raised yet; true when it was raised now. */
  async raise(tx: DbTx, step: WaitingStep, today: BusinessDate, correlationId: string): Promise<boolean> {
    const raised = await this.alerts.insertAlert(tx, {
      organizationId: step.organizationId,
      requestId: step.requestId,
      stepId: step.stepId,
      stepKind: step.stepKind,
      waitingReason: step.waitingReason,
      waitingSince: step.waitingSince,
    });
    if (!raised) return false;

    const recipients = alertRecipientsOf(step.stepKind, step.waitingReason);
    const itAdmin = recipients.includes('IT_ADMIN_IN_CHARGE')
      ? ((await this.organizationReads.getItAdminInCharge(step.requesterEmployeeId, today, tx))?.itAdminEmployeeId ??
        null)
      : null;
    await this.audit.record(
      tx,
      reassignmentAuditEvent(
        step.organizationId,
        'ACCESS_REQUEST.STEP_WAIT_ALERTED',
        'ACCESS_REQUEST_STEP',
        step.stepId,
        {
          requestId: step.requestId,
          stepKind: step.stepKind,
          waitingReason: step.waitingReason,
          configurationHint: configurationHintOf(step.waitingReason),
          waitingSince: step.waitingSince.toISOString(),
          notify: recipients.join(','),
          itAdminEmployeeId: itAdmin,
        },
        correlationId,
      ),
    );

    return true;
  }
}
