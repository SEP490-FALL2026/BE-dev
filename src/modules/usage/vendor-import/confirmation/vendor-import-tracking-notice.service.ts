import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { LicensingUsageApi } from '../../../licensing/public/licensing-usage.api';
import { NotificationsApi } from '../../../notifications/public/notifications.api';

/** How long the usage of a vendor is kept, as the notice says it (`US-08-05` AC-2): the day a report may reach back is six months (`QĐ-100af`). */
export const TRACKING_RETENTION_MONTHS = 6;
const DATA_KINDS = 'Ngày có hoạt động theo tài khoản của ứng dụng; không có khối lượng, nội dung hay vị trí.';
const PURPOSE =
  'Đối chiếu quyền đang giữ với việc sử dụng để tối ưu chi phí phần mềm; không dùng để chấm điểm cá nhân.';

/**
 * Tells everyone who holds the application that its usage is tracked, before a report is written (`US-08-05` AC-1 to AC-3). The notice is one
 * for each person and application (its event key), so a person who was told is not told again and a person who was given the application
 * after the first report is told by the next confirmation, before the days of that report are written (`DA6-08`).
 */
@Injectable()
export class VendorImportTrackingNoticeService {
  constructor(
    private readonly licensingUsage: LicensingUsageApi,
    private readonly notifications: NotificationsApi,
  ) {}

  /** Returns how many people were told now. */
  async tellHolders(
    tx: DbTx,
    input: { organizationId: string; applicationId: string; activityDefinition: string; today: BusinessDate },
  ): Promise<number> {
    const holders = await this.licensingUsage.listCurrentHolders(input.applicationId, input.today, tx);
    let told = 0;
    for (const employeeId of holders) {
      const written = await this.notifications.notifyInApp(tx, {
        organizationId: input.organizationId,
        recipientEmployeeId: employeeId,
        code: 'USAGE_TRACKING_NOTICE',
        subject: { type: 'APPLICATION', id: input.applicationId },
        params: {
          applicationId: input.applicationId,
          activityDefinition: input.activityDefinition,
          dataKinds: DATA_KINDS,
          purpose: PURPOSE,
          retentionMonths: TRACKING_RETENTION_MONTHS,
          viewPath: `/applications/${input.applicationId}/usage-tracking`,
        },
        eventKey: `USAGE_TRACKING_NOTICE:${input.applicationId}`,
      });
      if (written) told += 1;
    }

    return told;
  }
}
