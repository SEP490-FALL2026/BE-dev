import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../../organization/organization.service';
import type { OrganizationChange, OrganizationChangeListener } from '../../organization/organization.types';
import type { ReassignmentTrigger } from './reassignment.policy';
import { StepReassignmentRepo } from './step-reassignment.repo';
import { StepReassignmentService } from './step-reassignment.service';

/**
 * What the steps of the requests do when the organization changes (`FR-3.16`, `US-05-12`), in the transaction of the change:
 * the department of the requester, the head of a department and a person who has left are the three kinds of change that move
 * a step. A change of the job title alone moves nothing (`US-03-01` AC-11). Every step that waits is tried again on each of
 * them, since nobody holds it. The listener keys nothing on the change: the table is run on today's data, so hearing the same
 * change twice finds nothing left to change.
 */
@Injectable()
export class RequestsOrganizationChangeListener implements OrganizationChangeListener {
  constructor(
    private readonly repo: StepReassignmentRepo,
    private readonly reassignment: StepReassignmentService,
    private readonly organization: OrganizationService,
  ) {}

  async onChange(tx: DbTx, change: OrganizationChange): Promise<void> {
    const concerned = await this.concernedBy(tx, change);
    if (concerned === null) return;

    const waiting = await this.repo.waitingRequestIds(tx);
    await this.reassignment.reconcileRequests(
      tx,
      [...concerned.requestIds, ...waiting],
      concerned.trigger,
      change.id,
      new Date(),
    );
  }

  /** The requests the change may concern and the event it is; null for a change that moves no step. */
  private async concernedBy(
    tx: DbTx,
    change: OrganizationChange,
  ): Promise<{ requestIds: string[]; trigger: ReassignmentTrigger } | null> {
    switch (change.kind) {
      case 'PLACEMENT_START': {
        const changesDepartment = change.fromDepartmentId !== null && change.fromDepartmentId !== change.toDepartmentId;
        if (!changesDepartment) return null;

        return {
          requestIds: await this.repo.needRequestIdsOfRequesters([change.employeeId], tx),
          trigger: { kind: 'DEPARTMENT_CHANGED', employeeId: null },
        };
      }
      case 'HEAD_PERIOD_START':
      case 'HEAD_PERIOD_END': {
        const members =
          (await this.organization.getDepartmentMemberIds(change.departmentId, change.effectiveOn, tx)) ?? [];

        return {
          requestIds: [
            ...(await this.repo.needRequestIdsOfRequesters(members, tx)),
            ...(await this.repo.serviceAccountNeedRequestIdsOf(change.departmentId, tx)),
          ],
          trigger: { kind: 'HEAD_CHANGED', employeeId: null },
        };
      }
      case 'EMPLOYEE_LEFT':
        return {
          requestIds: await this.repo.requestIdsHeldBy([change.employeeId], tx),
          trigger: { kind: 'HOLDER_LEFT', employeeId: change.employeeId },
        };
    }
  }
}
