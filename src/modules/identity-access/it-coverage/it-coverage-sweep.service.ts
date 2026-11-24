import { Injectable } from '@nestjs/common';
import { businessDateAt } from '../../../core/business-date';
import { isWeekend } from '../../../core/working-days';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccountRecordService } from '../accounts/account-record.service';
import { ItCoverageNotifier } from './it-coverage-notifier.service';

/**
 * Checks active non-starting departments and active unplaced-work designations on weekdays, notifying the usable Super
 * Admin once per uncovered item per day when no usable IT Admin can act.
 */
@Injectable()
export class ItCoverageSweepService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly accounts: AccountRecordService,
    private readonly runner: TransactionRunner,
    private readonly notifier: ItCoverageNotifier,
  ) {}

  /** Runs one coverage check pass as of `now` and returns the number of new notices written. */
  async run(now: Date = new Date()): Promise<{ told: number }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return { told: 0 };
    const today = businessDateAt(now, organization.timeZone);
    if (isWeekend(today)) return { told: 0 };

    const superAdminEmployeeId = await this.accounts.findUsableSuperAdminEmployeeId();
    if (!superAdminEmployeeId) return { told: 0 };

    let told = await this.sweepDepartments(organization.id, superAdminEmployeeId, today);
    told += await this.sweepUnplacedWorkDesignations(organization.id, superAdminEmployeeId, today);

    return { told };
  }

  private async sweepDepartments(
    organizationId: string,
    superAdminEmployeeId: string,
    today: ReturnType<typeof businessDateAt>,
  ): Promise<number> {
    const departments = await this.organizationReads.getActiveDepartmentsForItCoverage();
    if (departments.length === 0) return 0;

    const actingByDept = await this.organizationReads.itAdminsActingFor(
      departments.map((department) => department.id),
      (ids) => this.accounts.findUsableItAdminEmployeeIds(ids),
    );

    let told = 0;
    for (const department of departments) {
      const acting = actingByDept.get(department.id);
      if (acting && (acting.inCharge !== null || acting.substitute !== null)) continue;

      const reason = department.itAdminEmployeeId === null ? 'NO_IN_CHARGE' : 'IN_CHARGE_NOT_USABLE';
      const sent = await this.runner.run((tx) =>
        this.notifier.missingCoverage(tx, {
          organizationId,
          superAdminEmployeeId,
          departmentId: department.id,
          departmentName: department.name,
          inChargeEmployeeId: department.itAdminEmployeeId,
          reason,
          today,
        }),
      );
      if (sent) told += 1;
    }

    return told;
  }

  private async sweepUnplacedWorkDesignations(
    organizationId: string,
    superAdminEmployeeId: string,
    today: ReturnType<typeof businessDateAt>,
  ): Promise<number> {
    const designations = await this.organizationReads.listActiveUnplacedWorkDesignations();
    if (designations.length === 0) return 0;

    const activeDesigneeIds = [
      ...new Set(
        designations
          .filter((designation) => designation.designeeStatus === 'ACTIVE')
          .map((designation) => designation.designeeEmployeeId),
      ),
    ];
    const usableDesignees =
      activeDesigneeIds.length > 0
        ? await this.accounts.findUsableItAdminEmployeeIds(activeDesigneeIds)
        : new Set<string>();

    let told = 0;
    for (const designation of designations) {
      if (designation.designeeStatus === 'ACTIVE' && usableDesignees.has(designation.designeeEmployeeId)) continue;

      const sent = await this.runner.run((tx) =>
        this.notifier.unplacedWorkWaiting(tx, {
          organizationId,
          superAdminEmployeeId,
          workKind: designation.workKind,
          workId: designation.workId,
          employeeId: designation.employeeId,
          today,
        }),
      );
      if (sent) told += 1;
    }

    return told;
  }
}
