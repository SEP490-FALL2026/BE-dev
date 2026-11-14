import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
import { progressOf, type DashboardProgress } from './dashboard-progress.policy';

/** The scope of the progress: the departments of an IT Admin (absent: the whole company) and the IT Admin whose tasks the seats are counted for (absent: all). */
export interface ProgressScope {
  departmentIds?: readonly string[] | undefined;
  responsibleEmployeeId?: string | undefined;
}

/**
 * Reads the progress of the departures and the transfers for the overview of an IT Admin or of the Super Admin (SPEC P21), each count through the facade of
 * the module that owns it, in the scope the caller gives. It checks no role: the overview decides who may read which.
 */
@Injectable()
export class DashboardProgressService {
  constructor(
    private readonly personnel: PersonnelDashboardApi,
    private readonly licensing: LicensingDashboardApi,
    private readonly catalog: CatalogResponsibilityApi,
  ) {}

  async read(today: BusinessDate, scope: ProgressScope): Promise<DashboardProgress> {
    return progressOf({
      personnel: await this.personnel.progress({ departmentIds: scope.departmentIds }, today),
      seats: await this.licensing.seatsReturned(today, scope.responsibleEmployeeId),
      plansBelowMinimum: await this.catalog.countPlansBelowVendorAdminMinimum(),
    });
  }
}
