import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isWorkingDay, wallClockAt, workingDaysBetween } from '../../../core/working-days';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { CongestionRepo } from './congestion.repo';
import { isBacklog } from './step-sla.policy';

export interface BacklogAlertResult {
  /** The alerts written now; one already given today is not counted. */
  alerted: number;
  failed: number;
}

/**
 * The alert of a backlog (`US-05-10` AC-1): on a working day, the Super Admin is told of each person who holds more steps waiting
 * for them than the threshold (the Super Admin's own parameter, `BACKLOG_ALERT_THRESHOLD`), once a working day for as long as the
 * backlog lasts. The spending approver counts like anybody else. The notice and its audit event are one transaction; the audit
 * event is written only when the notice was, so a second pass the same day writes nothing. It changes no step.
 */
@Injectable()
export class BacklogAlertService {
  private readonly logger = new Logger(BacklogAlertService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly congestion: CongestionRepo,
    private readonly notifications: NotificationsApi,
    private readonly audit: AuditApi,
    private readonly identity: IdentityAccessApi,
    private readonly organization: OrganizationApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  async alert(now: Date = new Date()): Promise<BacklogAlertResult> {
    const result: BacklogAlertResult = { alerted: 0, failed: 0 };
    const organization = await this.organization.getOrganization();
    if (!organization) return result;
    const today = await this.organization.businessToday(now);
    if (!isWorkingDay(today, await this.parameters.getNonWorkingDates(today, today))) return result;

    const threshold = Number(await this.parameters.getValueAt('BACKLOG_ALERT_THRESHOLD', now));
    const backlogs = (await this.congestion.backlogHolders(threshold)).filter((holder) =>
      isBacklog(holder.openSteps, threshold),
    );
    if (backlogs.length === 0) return result;
    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId();
    if (superAdmin === null) return result;

    const oldest = backlogs.reduce(
      (first, holder) => (holder.oldestCreatedAt < first ? holder.oldestCreatedAt : first),
      now,
    );
    const from = wallClockAt(oldest, organization.timeZone).date;
    const nonWorking = await this.parameters.getNonWorkingDates(from < today ? from : today, today);
    const correlationId = randomUUID();

    for (const holder of backlogs) {
      const oldestAgeWorkingDays = workingDaysBetween(
        wallClockAt(holder.oldestCreatedAt, organization.timeZone).date,
        today,
        nonWorking,
      );
      try {
        const written = await this.runner.run(async (tx) => {
          const given = await this.notifications.notifyInApp(tx, {
            organizationId: organization.id,
            recipientEmployeeId: superAdmin,
            code: 'STEP_BACKLOG_ALERT',
            subject: null,
            params: {
              holderEmployeeId: holder.holderEmployeeId,
              openCount: holder.openSteps,
              threshold,
              oldestAgeWorkingDays,
            },
            eventKey: `BACKLOG:${holder.holderEmployeeId}:${today}`,
          });
          if (!given) return false;
          await this.audit.record(tx, {
            organizationId: organization.id,
            actorKind: 'SYSTEM',
            actorAppUserId: null,
            actorRoles: [],
            action: 'STEP_CONGESTION.BACKLOG_ALERTED',
            resourceType: 'EMPLOYEE',
            resourceId: holder.holderEmployeeId,
            before: null,
            after: {
              businessDate: today,
              openSteps: holder.openSteps,
              threshold,
              oldestAgeWorkingDays,
              notify: superAdmin,
            },
            correlationId,
          });

          return true;
        });
        if (written) result.alerted += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error(`The alert of a backlog failed: ${(error as Error).name}`);
      }
    }

    return result;
  }
}
