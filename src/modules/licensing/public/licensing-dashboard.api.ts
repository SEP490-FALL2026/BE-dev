import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DashboardFactsService } from '../dashboard-facts/dashboard-facts.service';
import type {
  DepartmentLicensingFacts,
  EmployeeLicensingFacts,
  ItAdminLicensingFacts,
  SeatsReturnedFacts,
} from './licensing-dashboard.types';

/**
 * What the role overviews read of licensing (`US-12-15` AC-2, AC-3, AC-4): counts only, each the count of an existing list in the same
 * scope, never a row, a price or a key. The caller decides who may read which; nothing here is checked against a role.
 */
@Injectable()
export class LicensingDashboardApi {
  constructor(private readonly facts: DashboardFactsService) {}

  /** The person's current rights, those about to end, and their open SaaS reports. */
  employeeFacts(employeeId: string, today: BusinessDate): Promise<EmployeeLicensingFacts> {
    return this.facts.employee(employeeId, today);
  }

  /** The seats the department uses on the business day; null when the department does not exist. */
  departmentFacts(departmentId: string, today: BusinessDate): Promise<DepartmentLicensingFacts | null> {
    return this.facts.department(departmentId, today);
  }

  /** The open tasks and reports the IT Admin is in charge of, and the keys in the vault not assigned yet. */
  itAdminFacts(employeeId: string): Promise<ItAdminLicensingFacts> {
    return this.facts.itAdmin(employeeId);
  }

  /**
   * The seats of the shared pools (`K2`) taken back for a departure or a transfer and handed out again from the first of the month of `today` to `today`
   * (SPEC P21). With `responsibleEmployeeId`, the tasks that IT Admin is in charge of by default; without it, the whole company.
   */
  seatsReturned(today: BusinessDate, responsibleEmployeeId?: string): Promise<SeatsReturnedFacts> {
    return this.facts.seatsReturned(today, responsibleEmployeeId);
  }
}
