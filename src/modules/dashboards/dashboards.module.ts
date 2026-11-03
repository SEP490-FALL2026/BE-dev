import { Module } from '@nestjs/common';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { LicensingModule } from '../licensing/licensing.module';
import { OrganizationModule } from '../organization/organization.module';
import { PersonnelModule } from '../personnel/personnel.module';
import { RequestsModule } from '../requests/requests.module';
import { EmployeeDashboardController } from './employee/employee-dashboard.controller';
import { EmployeeDashboardService } from './employee/employee-dashboard.service';
import { ItAdminDashboardController } from './it-admin/it-admin-dashboard.controller';
import { ItAdminDashboardService } from './it-admin/it-admin-dashboard.service';
import { ManagerDashboardController } from './manager/manager-dashboard.controller';
import { ManagerDashboardService } from './manager/manager-dashboard.service';
import { SuperAdminDashboardController } from './super-admin/super-admin-dashboard.controller';
import { SuperAdminDashboardService } from './super-admin/super-admin-dashboard.service';

/**
 * The role overviews of operations (`US-12-15` AC-2, AC-3, AC-4, AC-7). It owns no table and no write: each section is a count read
 * through the facade of the module that owns the data, the name of the existing operation that lists the rows, or a section that says
 * its data has no source yet. Only the API mounts it.
 */
@Module({
  imports: [OrganizationModule, IdentityAccessFacadeModule, LicensingModule, PersonnelModule, RequestsModule],
  controllers: [
    EmployeeDashboardController,
    ManagerDashboardController,
    ItAdminDashboardController,
    SuperAdminDashboardController,
  ],
  providers: [EmployeeDashboardService, ManagerDashboardService, ItAdminDashboardService, SuperAdminDashboardService],
})
export class DashboardsModule {}
