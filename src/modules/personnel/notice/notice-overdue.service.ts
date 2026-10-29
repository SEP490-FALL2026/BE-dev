import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { personnelSystemAuditEvent } from '../mappers/personnel-audit-event.mapper';
import { NoticeRepo } from './notice.repo';

/** How many notices one pass tells about; the next pass takes the rest. */
const BATCH = 200;

/**
 * Tells, once for each notice, that its day has passed without the Super Admin handling it (`US-03-10` AC-2, `US-03-11` AC-5): the Super
 * Admin is told in the inbox in the same transaction (F17) and the audit event keeps the fact. It only tells. The notice is never recorded or rejected by the
 * calendar and the person it is about is never changed. The mark and the event are written together, so a notice is told once however
 * many instances run the sweep.
 */
@Injectable()
export class NoticeOverdueService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly notices: NoticeRepo,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /** Returns how many notices were told in this pass. */
  async noticeOverdue(now: Date = new Date()): Promise<number> {
    const today = await this.organization.businessToday(now);
    const late = await this.notices.listOverdueUnnoticed(today, BATCH);
    let told = 0;
    for (const notice of late) {
      const marked = await this.runner.run(async (tx) => {
        if (!(await this.notices.markOverdueNoticed(tx, notice.id))) return false;
        await this.audit.record(
          tx,
          personnelSystemAuditEvent(
            notice.organizationId,
            'PERSONNEL_NOTICE.OVERDUE',
            'PersonnelNotice',
            notice.id,
            notice.id,
            null,
            {
              code: notice.code,
              kind: notice.kind,
              employeeId: notice.employeeId,
              dueOn: notice.dueOn,
              defaultItAdmin: notice.defaultItAdminEmployeeId,
            },
          ),
        );
        await this.notifier.noticeOverdue(tx, {
          organizationId: notice.organizationId,
          employeeId: notice.employeeId,
          departmentId: notice.senderDepartmentId,
          noticeId: notice.id,
          kind: notice.kind,
        });

        return true;
      });
      if (marked) told += 1;
    }

    return told;
  }
}
