import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { personnelSystemAuditEvent } from '../personnel-audit-event.mapper';
import { isRevocationOverdue, overdueNoticeOwed, type RevocationStanding } from './departure-deadline.policy';
import { DepartureDeadlineRepo, type LateCase } from './departure-deadline.repo';

/** How many cases are read, and how many people's seats are counted, in one statement. */
const PAGE = 200;

/** A departure past its deadline that still has rights without a completed task. */
export interface OverdueCase extends LateCase {
  /** The personal seats of the person with no task of revocation completed. */
  rightCount: number;
}

const standingOf = (late: OverdueCase): RevocationStanding => ({
  state: late.state,
  closed: false,
  dueOn: late.revocationDueOn,
  rightsWithoutCompletedTask: late.rightCount,
});

/**
 * Tells the IT Admin in charge and the Super Admin, on each working day, that the rights of a person who is leaving are still not taken away
 * past the deadline of the case (`QĐ-110c`, `M-09`, SPEC T-MF2). It judges the case, not the tasks: a right the IT Admin never opened a task for
 * keeps the case late as much as a task that waits, so silence cannot hide a right. The notice is written once for a case and a day
 * (`offboarding:<case>:<day>`), with an audit event of the system in the same transaction, so a pass that runs again or on another instance
 * writes nothing new. It only tells: no task is opened, no seat taken away, and the case is never changed.
 *
 * It judges **departures only**, on purpose (D-124): the tasks a transfer opens when its grace ends (`TRANSFER`) carry no `due_on` and no case, so
 * no notice is written for them; their deadline is worked out for the report of the SLA (`GET /reports/revocation-sla`), which counts them overdue.
 */
@Injectable()
export class RevocationOverdueService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly cases: DepartureDeadlineRepo,
    private readonly licensing: LicensingApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
    private readonly audit: AuditApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /**
   * Every open departure past its deadline that has a right left without a completed task, with how many, by id. `departmentIds` narrows to
   * the cases of those departments (the scope of an IT Admin). The list of departures and the telling share this reading.
   */
  async overdueCases(today: BusinessDate, departmentIds?: readonly string[]): Promise<OverdueCase[]> {
    const overdue: OverdueCase[] = [];
    let afterId: string | null = null;
    for (;;) {
      const page: LateCase[] = await this.cases.pageLate(today, { afterId, take: PAGE, departmentIds });
      if (page.length === 0) break;
      const counts = await this.licensing.countPersonalSeatsWithoutCompletedTaskOf(
        page.map((late) => late.employeeId),
        today,
      );
      for (const late of page) {
        const candidate = { ...late, rightCount: counts.get(late.employeeId) ?? 0 };
        if (isRevocationOverdue(standingOf(candidate), today)) overdue.push(candidate);
      }
      if (page.length < PAGE) break;
      afterId = page[page.length - 1].id;
    }

    return overdue;
  }

  /** Returns how many cases were told in this pass (a case already told today is not counted). */
  async noticeOverdue(now: Date = new Date()): Promise<number> {
    const today = await this.organizationReads.businessToday(now);
    const nonWorking = await this.parameters.getNonWorkingDates(today, today);
    let told = 0;
    for (const late of await this.overdueCases(today)) {
      if (!overdueNoticeOwed(standingOf(late), today, nonWorking)) continue;
      if (await this.tell(late, today)) told += 1;
    }

    return told;
  }

  private tell(late: OverdueCase, today: BusinessDate): Promise<boolean> {
    return this.runner.run(async (tx) => {
      const written = await this.notifier.revocationOverdue(tx, {
        organizationId: late.organizationId,
        employeeId: late.employeeId,
        departmentId: late.departmentId,
        caseId: late.id,
        dueOn: late.revocationDueOn,
        rightCount: late.rightCount,
        today,
      });
      if (written) {
        await this.audit.record(
          tx,
          personnelSystemAuditEvent(
            late.organizationId,
            'OFFBOARDING_CASE.REVOCATION_OVERDUE',
            'OffboardingCase',
            late.id,
            `offboarding:${late.id}:${today}`,
            null,
            { employeeId: late.employeeId, dueOn: late.revocationDueOn, rightCount: late.rightCount, day: today },
          ),
        );
      }

      return written;
    });
  }
}
