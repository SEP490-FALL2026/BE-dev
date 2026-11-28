import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import type { UnplacedWorkKind } from '../../organization/public/organization.types';

export type MissingItCoverageReason = 'NO_IN_CHARGE' | 'IN_CHARGE_NOT_USABLE';

/** Sends daily Super Admin alerts when a department or unplaced-work designation loses usable IT coverage. */
@Injectable()
export class ItCoverageNotifier {
  constructor(private readonly notifications: NotificationsApi) {}

  missingCoverage(
    tx: DbTx,
    input: {
      organizationId: string;
      superAdminEmployeeId: string;
      departmentId: string;
      departmentName: string;
      inChargeEmployeeId: string | null;
      reason: MissingItCoverageReason;
      today: BusinessDate;
    },
  ): Promise<boolean> {
    return this.notifications.notifyInApp(tx, {
      organizationId: input.organizationId,
      recipientEmployeeId: input.superAdminEmployeeId,
      code: 'DEPARTMENT_IT_COVERAGE_MISSING',
      subject: { type: 'DEPARTMENT', id: input.departmentId },
      params: {
        departmentId: input.departmentId,
        departmentName: input.departmentName,
        inChargeEmployeeId: input.inChargeEmployeeId,
        reason: input.reason,
      },
      eventKey: `departmentItCoverage:${input.departmentId}:${input.today}`,
    });
  }

  unplacedWorkWaiting(
    tx: DbTx,
    input: {
      organizationId: string;
      superAdminEmployeeId: string;
      workKind: UnplacedWorkKind;
      workId: string;
      employeeId: string;
      today: BusinessDate;
    },
  ): Promise<boolean> {
    return this.notifications.notifyInApp(tx, {
      organizationId: input.organizationId,
      recipientEmployeeId: input.superAdminEmployeeId,
      code: 'UNPLACED_WORK_WAITING',
      subject: null,
      params: {
        workKind: input.workKind,
        workId: input.workId,
        employeeId: input.employeeId,
      },
      eventKey: `unplacedWork:${input.workKind}:${input.workId}:${input.today}`,
    });
  }
}
