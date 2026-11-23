import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../notifications/public/notifications.api';

export type MissingItCoverageReason = 'NO_IN_CHARGE' | 'IN_CHARGE_NOT_USABLE';

/** Sends the daily Super Admin alert when an active non-starting department has no acting IT Admin. */
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
}
