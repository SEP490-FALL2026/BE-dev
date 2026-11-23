import { Injectable } from '@nestjs/common';
import { businessDateAt } from '../../../core/business-date';
import { isWeekend } from '../../../core/working-days';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccountRecordService } from '../accounts/account-record.service';
import { ItCoverageNotifier } from './it-coverage-notifier.service';

/**
 * Checks active non-starting departments on weekdays and notifies the usable Super Admin once per department per day
 * when neither a usable IT Admin in charge nor a usable appointed substitute can act for the department.
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

    const departments = await this.organizationReads.getActiveDepartmentsForItCoverage();
    if (departments.length === 0) return { told: 0 };

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
          organizationId: organization.id,
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

    return { told };
  }
}
