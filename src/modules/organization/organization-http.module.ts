import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ObjectStorageModule } from '../../infrastructure/object-storage/object-storage.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationChangeSweeper } from './change-announcement/organization-change.job';
import { CostCenterNotificationNamesListener } from './cost-center/cost-center-notification-names.listener';
import { CostCenterService } from './cost-center/cost-center.service';
import { CostCentersController } from './cost-center/cost-centers.controller';
import { DepartmentItSubstituteController } from './department-it-substitute/department-it-substitute.controller';
import { DepartmentItSubstituteService } from './department-it-substitute/department-it-substitute.service';
import { DepartmentHeadService } from './department-management/department-head.service';
import { DepartmentHeadsController } from './department-management/department-heads.controller';
import { DepartmentTechnicalMembersRepo } from './department-management/department-technical-members.repo';
import { DepartmentNotificationNamesListener } from './department/department-notification-names.listener';
import { HeldNoticeHandoverListener } from './department/held-notice-handover.listener';
import { DepartmentQueryService } from './department-management/department-query.service';
import { DepartmentItAdminService } from './department-management/department-it-admin.service';
import { DepartmentAvatarService } from './department-management/department-avatar.service';
import { DepartmentService } from './department-management/department.service';
import { DepartmentsController } from './department-management/departments.controller';
import { EmployeeMaintenanceController } from './employee/employee-maintenance.controller';
import { EmployeeMaintenanceService } from './employee/employee-maintenance.service';
import { EmployeeFirstPlacementCorrectionService } from './employee/first-placement-correction/employee-first-placement-correction.service';
import { EmployeeFirstPlacementService } from './employee/employee-first-placement.service';
import { EmployeeManualService } from './employee/employee-manual.service';
import { EmployeesController } from './employee/employees.controller';
import { EmployeeDirectoryController } from './employee-directory/employee-directory.controller';
import { EmployeeDirectoryQueryService } from './employee-directory/employee-directory-query.service';
import { EmployeeDirectoryRepo } from './employee-directory/employee-directory.repo';
import { EmployeeNotificationNamesListener } from './employee-directory/employee-notification-names.listener';
import { OrganizationModule } from './organization.module';

/**
 * The HTTP side of the organization module, mounted by the API only. It is a module of its own, not part of
 * `OrganizationModule`, because the installation command and the worker import `OrganizationModule` for the
 * facade and must not carry controllers with them. The accounts of the employees the department use cases check are read through
 * `EmployeeAccountsHook`, which identity-access binds (D5): this module never imports identity-access.
 */
@Module({
  imports: [DatabaseModule, ObjectStorageModule, AuditModule, OrganizationModule, NotificationsModule],
  controllers: [
    EmployeesController,
    EmployeeDirectoryController,
    EmployeeMaintenanceController,
    CostCentersController,
    DepartmentsController,
    DepartmentHeadsController,
    DepartmentItSubstituteController,
  ],
  providers: [
    EmployeeManualService,
    EmployeeFirstPlacementService,
    EmployeeFirstPlacementCorrectionService,
    EmployeeMaintenanceService,
    CostCenterService,
    DepartmentQueryService,
    DepartmentService,
    DepartmentAvatarService,
    DepartmentItAdminService,
    DepartmentHeadService,
    DepartmentItSubstituteService,
    // Hands the notices kept for a department with no head to the head whose period starts, added to the change listeners.
    HeldNoticeHandoverListener,
    // Name an employee, a department and a Cost Center in a notification sentence: added to the name sources of `notifications`, which only the API graph reads
    // (here and not in `OrganizationModule`, which the installation command imports and which must not carry `NotificationsModule`).
    EmployeeNotificationNamesListener,
    DepartmentNotificationNamesListener,
    CostCenterNotificationNamesListener,
    DepartmentTechnicalMembersRepo,
    // The hourly telling of the changes dated for a day that has come: in the API graph only, where every listener is registered.
    OrganizationChangeSweeper,
    EmployeeDirectoryQueryService,
    EmployeeDirectoryRepo,
  ],
})
export class OrganizationHttpModule {}
