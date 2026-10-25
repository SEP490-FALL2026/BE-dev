import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { personnelSystemAuditEvent } from '../mappers/personnel-audit-event';
import { LeaveRepo } from './leave.repo';

/** How many leaves one pass tells about; the next pass takes the rest. */
const BATCH = 200;

/**
 * Tells, once for each approved day of return, that the person is not back on it (`US-03-03` AC-4): the audit event is the point the
 * reminder to the IT Admin is taken from. It only tells. The state of the person is never changed by the calendar, and a leave that
 * moves to a new day and then passes that day is told again. The mark and the event are written together, so a day is told once
 * however many instances run the sweep.
 */
@Injectable()
export class LeaveOverdueService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly leaves: LeaveRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
  ) {}

  /** Returns how many leaves were told in this pass. */
  async noticeOverdue(now: Date = new Date()): Promise<number> {
    const today = await this.organization.businessToday(now);
    const late = await this.leaves.listOverdueUnnoticed(today, BATCH);
    let told = 0;
    for (const leave of late) {
      const marked = await this.runner.run(async (tx) => {
        if (!(await this.leaves.markOverdueNoticed(tx, leave.id, leave.approvedReturnOn))) return false;
        await this.audit.record(
          tx,
          personnelSystemAuditEvent(
            leave.organizationId,
            'LONG_LEAVE.RETURN_OVERDUE',
            'EmployeeLeave',
            leave.id,
            leave.id,
            null,
            {
              employeeId: leave.employeeId,
              startedOn: leave.startedOn,
              approvedReturnOn: leave.approvedReturnOn,
              overdueDays: daysBetween(leave.approvedReturnOn, today),
            },
          ),
        );

        return true;
      });
      if (marked) told += 1;
    }

    return told;
  }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
