import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  OrganizationChangeListeners,
  type OrganizationChangeListener,
} from '../../organization/public/organization.extension-points';
import type { OrganizationChange } from '../../organization/public/organization.types';
import { RequestDraftDepartureService } from '../draft/request-draft-departure.service';
import type { ReassignmentTrigger } from '../step-routing/reassignment.policy';
import { StepReassignmentRepo } from '../step-routing/step-reassignment.repo';
import { DepartmentWithoutHeadNotice } from './department-without-head-notice.service';
import { StepReassignmentService } from './step-reassignment.service';

/**
 * What the steps of the requests do when the organization changes (`FR-3.16`, `US-05-12`), in the transaction of the change:
 * the department of the requester, the head of a department and a person who has left are the three kinds of change that move
 * a step. A change of the job title alone moves nothing (`US-03-01` AC-11). Every step that waits is tried again on each of
 * them, since nobody holds it. The listener keys nothing on the change: the table is run on today's data, so hearing the same
 * change twice finds nothing left to change. It adds itself to the change listeners of the organization when the module starts,
 * so the organization never imports this module.
 */
@Injectable()
export class RequestsOrganizationChangeListener implements OrganizationChangeListener, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [OrganizationChangeListeners] as const;

  constructor(
    private readonly repo: StepReassignmentRepo,
    private readonly reassignment: StepReassignmentService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly drafts: RequestDraftDepartureService,
    private readonly withoutHead: DepartmentWithoutHeadNotice,
    private readonly changes: OrganizationChangeListeners,
  ) {}

  onModuleInit(): void {
    this.changes.add('requests.step-reassignment', (tx, change) => this.onChange(tx, change));
  }

  async onChange(tx: DbTx, change: OrganizationChange): Promise<void> {
    // The drafts of a person who left are theirs alone and go with them, whoever else the change moves a step of.
    if (change.kind === 'EMPLOYEE_LEFT') await this.drafts.deleteOf(tx, change.employeeId, change.id);
    const concerned = await this.concernedBy(tx, change);
    if (concerned === null) return;

    const waiting = await this.repo.waitingRequestIds(tx);
    // Both the requests the change concerns and the ones that wait may take locks: take their union first, globally sorted, before any mutates a subset.
    await this.repo.lockIds(tx, [...concerned.requestIds, ...waiting]);
    await this.reassignment.reconcileRequests(
      tx,
      [...concerned.requestIds, ...waiting],
      concerned.trigger,
      change.id,
      new Date(),
    );
    // A department left without a head keeps its requests waiting for one (`QĐ-110i`): nothing turns them into one-step, and the Super Admin is told.
    if (change.kind === 'HEAD_PERIOD_END') await this.withoutHead.tellIfLeftWithoutHead(tx, change, new Date());
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
          (await this.organizationReads.getDepartmentMemberIds(change.departmentId, change.effectiveOn, tx)) ?? [];

        return {
          requestIds: [
            // The internal requests of the people who sit in the department now, and everything sent for the department.
            ...(await this.repo.needRequestIdsOfRequesters(members, tx)),
            ...(await this.repo.needRequestIdsOfDepartment(change.departmentId, tx)),
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
