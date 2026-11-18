import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { renewalWindowOpenedAlert } from '../licensing-alerts.policy';
import { LicensingAlerts } from '../licensing-alerts.service';
import { ExpiryRenewalWindowRepo, type WindowCandidate } from './expiry-renewal-window.repo';

/** How many rights one pass looks at; the next pass takes the rest. */
const PASS_BATCH = 200;

/**
 * The opening of the window in which the holder may send the renewal of a right that ends on a day (`BR-MF1-08a`, `QĐ-108b`): once an hour
 * every open personal right whose end falls within `RENEWAL_WINDOW_DAYS` days is recorded as open, with the number of days in force now,
 * and its holder and the head of their department today are told once (a department with no head: only the holder). One transaction for
 * each right: the row, its audit event and the notices. A window already recorded keeps its days when the parameter changes later; a
 * right renewed, ended or cancelled is not read. Nothing about the right is changed.
 */
@Injectable()
export class ExpiryRenewalWindowService {
  constructor(
    private readonly repo: ExpiryRenewalWindowRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
    private readonly runner: TransactionRunner,
    private readonly audit: AuditApi,
    private readonly alerts: LicensingAlerts,
  ) {}

  /** Records the windows that opened and returns how many were new in this pass. */
  async openDue(now: Date = new Date()): Promise<number> {
    const today = await this.organizationReads.businessToday(now);
    const windowDays = Number(await this.parameters.getValue('RENEWAL_WINDOW_DAYS'));
    const candidates = await this.repo.candidates(today, windowDays, PASS_BATCH);
    if (candidates.length === 0) return 0;

    const units = await this.organizationReads.getOwningUnits([...new Set(candidates.map((c) => c.employeeId))], today);
    const departments = [...new Set([...units.values()].map((unit) => unit.departmentId))];
    const heads = await this.organizationReads.getDepartmentHeads(departments, today);
    let opened = 0;
    for (const candidate of candidates) {
      const departmentId = units.get(candidate.employeeId)?.departmentId ?? null;
      const headEmployeeId = departmentId ? (heads.get(departmentId)?.employeeId ?? null) : null;
      if (await this.open(candidate, windowDays, headEmployeeId)) opened += 1;
    }

    return opened;
  }

  private open(candidate: WindowCandidate, windowDays: number, headEmployeeId: string | null): Promise<boolean> {
    const opensOn: BusinessDate = addDays(candidate.expectedEndDate, -windowDays);

    return this.runner.run(async (tx) => {
      if (!(await this.repo.insert(tx, { candidate, windowDays, opensOn }))) return false;
      await this.audit.record(tx, {
        organizationId: candidate.organizationId,
        actorKind: 'SYSTEM',
        action: 'LICENSE_ASSIGNMENT.RENEWAL_WINDOW_OPENED',
        resourceType: 'LicenseAssignment',
        resourceId: candidate.assignmentId,
        before: null,
        after: {
          holderEmployeeId: candidate.employeeId,
          planId: candidate.planId,
          expectedEndDate: candidate.expectedEndDate,
          windowDays,
          opensOn,
          headEmployeeId,
        },
        correlationId: candidate.assignmentId,
      });
      const alert = (audience: 'EMPLOYEE' | 'HEAD') =>
        renewalWindowOpenedAlert({
          assignmentId: candidate.assignmentId,
          holderEmployeeId: candidate.employeeId,
          planId: candidate.planId,
          expectedEndDate: candidate.expectedEndDate,
          opensOn,
          audience,
        });
      await this.alerts.tell(tx, candidate.organizationId, [candidate.employeeId], alert('EMPLOYEE'));
      // The holder who heads their own department is told once, as the holder.
      if (headEmployeeId !== null && headEmployeeId !== candidate.employeeId) {
        await this.alerts.tell(tx, candidate.organizationId, [headEmployeeId], alert('HEAD'));
      }

      return true;
    });
  }
}
