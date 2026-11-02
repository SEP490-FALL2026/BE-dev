import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationChangeSweeper } from './change-announcement/organization-change.job';
import { CostCenterService } from './cost-center/cost-center.service';
import { CostCentersController } from './cost-center/cost-centers.controller';
import { DepartmentHeadService } from './department-management/department-head.service';
import { DepartmentHeadsController } from './department-management/department-heads.controller';
import { DepartmentTechnicalMembersRepo } from './department-management/department-technical-members.repo';
import { HeldNoticeHandoverListener } from './department/held-notice-handover.listener';
import { DepartmentQueryService } from './department-management/department-query.service';
import { DepartmentService } from './department-management/department.service';
import { DepartmentsController } from './department-management/departments.controller';
import { EmployeeMaintenanceController } from './employee/employee-maintenance.controller';
import { EmployeeMaintenanceService } from './employee/employee-maintenance.service';
import { EmployeeManualService } from './employee/employee-manual.service';
import { EmployeesController } from './employee/employees.controller';
import { OrganizationModule } from './organization.module';

/**
 * The HTTP side of the organization module, mounted by the API only. It is a module of its own, not part of
 * `OrganizationModule`, because the installation command and the worker import `OrganizationModule` for the
 * facade and must not carry controllers with them. The accounts of the employees the department use cases check are read through
 * `EmployeeAccountsHook`, which identity-access binds (D5): this module never imports identity-access.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule, NotificationsModule],
  controllers: [
    EmployeesController,
    EmployeeMaintenanceController,
    CostCentersController,
    DepartmentsController,
    DepartmentHeadsController,
  ],
  providers: [
    EmployeeManualService,
    EmployeeMaintenanceService,
    CostCenterService,
    DepartmentQueryService,
    DepartmentService,
    DepartmentHeadService,
    // Hands the notices kept for a department with no head to the head whose period starts, added to the change listeners.
    HeldNoticeHandoverListener,
    DepartmentTechnicalMembersRepo,
    // The hourly telling of the changes dated for a day that has come: in the API graph only, where every listener is registered.
    OrganizationChangeSweeper,
  ],
})
export class OrganizationHttpModule {}
