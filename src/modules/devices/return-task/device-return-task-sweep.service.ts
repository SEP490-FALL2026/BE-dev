import { Injectable, Logger } from '@nestjs/common';
import { isWorkingDay } from '../../../core/working-days';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DeviceReturnTaskNotifier } from './device-return-task-notifier.service';
import { shouldRemindOn } from './device-return-task.policy';
import { DeviceReturnTaskRepo } from './device-return-task.repo';

const BATCH = 200;

/**
 * Hourly pass that sends once-per-working-day overdue reminders for open offboarding device return tasks
 * past their due date. Each task locks `FOR UPDATE SKIP LOCKED` in its own transaction and stamps `overdueNoticedOn`.
 */
@Injectable()
export class DeviceReturnTaskSweepService {
  private readonly logger = new Logger(DeviceReturnTaskSweepService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
    private readonly repo: DeviceReturnTaskRepo,
    private readonly notifier: DeviceReturnTaskNotifier,
  ) {}

  async run(now: Date = new Date()): Promise<{ told: number }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return { told: 0 };
    const today = await this.organizationReads.businessToday(now);
    const nonWorking = await this.parameters.getNonWorkingDates(today, today);
    if (!isWorkingDay(today, nonWorking)) return { told: 0 };

    let told = 0;
    for (const id of await this.repo.listOverdueCandidateIds(organization.id, today, BATCH)) {
      try {
        const notified = await this.runner.run(async (tx) => {
          const locked = await this.repo.lockOverdueForNoticeSkipLocked(tx, id);
          if (!locked) return false;
          if (
            !shouldRemindOn({
              state: locked.state,
              dueOn: locked.dueOn,
              overdueNoticedOn: locked.overdueNoticedOn,
              today,
              isWorkingDay: true,
            })
          ) {
            return false;
          }
          await this.repo.markOverdueNoticed(tx, locked.id, today);
          await this.notifier.overdue(tx, {
            organizationId: organization.id,
            task: locked,
            assetCode: locked.assetCode,
            today,
          });

          return true;
        });
        if (notified) told += 1;
      } catch (error) {
        this.logger.error(
          `Overdue reminder for return task ${id} failed: ${describeForOperator(error)}`,
          traceForOperator(error),
        );
      }
    }

    return { told };
  }
}
