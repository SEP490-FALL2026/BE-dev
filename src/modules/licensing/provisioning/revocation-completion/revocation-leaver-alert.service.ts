import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { OrganizationApi } from '../../../organization/public/organization.api';
import { leaverAccessAlert, leaverKeepsAccess } from '../../licensing-alerts.policy';
import { LicensingAlerts } from '../../licensing-alerts.service';
import type { AccessState } from '../../public/licensing.types';
import { ProvisioningTaskReasonRepo } from '../provisioning-task-reason.repo';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';

/**
 * The alert that a person who leaves keeps the access of a K1 seat until the end of the paid period (`US-12-15` line 38,
 * `QĐ-77l`): told to the IT Admin in charge of the department of the person, once for the task, in the transaction of the
 * completion. Nothing for any other completion, nor when no reason of the revocation is a departure.
 */
@Injectable()
export class RevocationLeaverAlert {
  constructor(
    private readonly reasons: ProvisioningTaskReasonRepo,
    private readonly alerts: LicensingAlerts,
    private readonly organization: OrganizationApi,
  ) {}

  /**
   * The department is the one of today, or of the day the revocation was opened for a person no longer placed; nobody usable in
   * charge, nobody told. Returns how many notices were new.
   */
  async tell(
    tx: DbTx,
    input: {
      organizationId: string;
      task: ProvisioningTaskRecord;
      accessState: AccessState | null;
      accessUntil: BusinessDate;
      today: BusinessDate;
    },
  ): Promise<number> {
    const { task } = input;
    const reasons = await this.reasons.listOf([task.id], tx);
    const sources = [...(task.revocationSource ? [task.revocationSource] : []), ...reasons.map((r) => r.source)];
    if (!leaverKeepsAccess({ accessState: input.accessState, sources })) return 0;

    const openedOn = await this.organization.businessToday(task.createdAt, tx);
    const itAdmin = await this.alerts.itAdminOfPerson(task.assignment.employeeId, [input.today, openedOn], tx);

    return this.alerts.tell(
      tx,
      input.organizationId,
      [itAdmin],
      leaverAccessAlert({
        taskId: task.id,
        assignmentId: task.assignmentId,
        employeeId: task.assignment.employeeId,
        planId: task.assignment.planId,
        accessUntil: input.accessUntil,
      }),
    );
  }
}
