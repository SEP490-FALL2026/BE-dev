import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { leftWithoutHead } from '../step-routing/department-without-head.policy';
import { StepReassignmentRepo } from '../step-routing/step-reassignment.repo';

/**
 * Tells the Super Admin that a department is left without a head (`QĐ-110i`, `MF1-X.2`): the notice `DEPARTMENT_WITHOUT_HEAD`, with the number of
 * requests that wait for one, written in the transaction of the change that ended the head period, so it exists exactly when the change commits.
 * It is told once for each change (the key is the change). Nothing else moves because of it: the requests wait, and go to the head the day one starts
 * (`StepReassignmentService`); the alert of each step that waits is a separate notice (`ControlledWaitAlertService`).
 */
@Injectable()
export class DepartmentWithoutHeadNotice {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly notifications: NotificationsApi,
    private readonly repo: StepReassignmentRepo,
  ) {}

  /** True when the notice was written now; false when the department still has a head or one is recorded to follow, nobody can be told, or it was told. */
  async tellIfLeftWithoutHead(tx: DbTx, change: { id: string; departmentId: string }, now: Date): Promise<boolean> {
    const today = await this.organizationReads.businessToday(now, tx);
    const head = (await this.organizationReads.getDepartmentHeads([change.departmentId], today, tx)).get(
      change.departmentId,
    );
    const person = head ? await this.organizationReads.getEmployee(head.employeeId, tx) : null;
    const successor = await this.organizationReads.nextHeadPeriodOf(change.departmentId, today, tx);
    if (!leftWithoutHead({ headWorks: person?.status === 'ACTIVE', successorRecorded: successor !== null }))
      return false;

    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
    const organization = await this.organizationReads.getOrganization(tx);
    if (superAdmin === null || organization === null) return false;

    return this.notifications.notifyInApp(tx, {
      organizationId: organization.id,
      recipientEmployeeId: superAdmin,
      code: 'DEPARTMENT_WITHOUT_HEAD',
      subject: { type: 'DEPARTMENT', id: change.departmentId },
      params: {
        departmentId: change.departmentId,
        waitingCount: await this.repo.countWaitingForHead(tx, change.departmentId),
      },
      eventKey: `DEPARTMENT_WITHOUT_HEAD:${change.departmentId}:${change.id}`,
    });
  }
}
