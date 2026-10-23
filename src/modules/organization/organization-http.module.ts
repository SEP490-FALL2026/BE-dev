import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { CostCenterService } from './cost-center/cost-center.service';
import { CostCentersController } from './cost-center/cost-centers.controller';
import { DepartmentHeadService } from './department/department-head.service';
import { DepartmentQueryService } from './department/department-query.service';
import { DepartmentService } from './department/department.service';
import { DepartmentsController } from './department/departments.controller';
import { EmployeeMaintenanceController } from './employee/employee-maintenance.controller';
import { EmployeeMaintenanceService } from './employee/employee-maintenance.service';
import { EmployeeManualService } from './employee/employee-manual.service';
import { EmployeesController } from './employee/employees.controller';
import { JobTitleService } from './job-title/job-title.service';
import { JobTitlesController } from './job-title/job-titles.controller';
import { OrganizationModule } from './organization.module';
import { ProjectRepo } from './project/project.repo';
import { ProjectService } from './project/project.service';
import { ProjectsController } from './project/projects.controller';

/**
 * The HTTP side of the organization module, mounted by the API only. It is a module of its own, not part of
 * `OrganizationModule`, because the installation command and the worker import `OrganizationModule` for the
 * facade and must not carry controllers with them.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule, IdentityAccessFacadeModule],
  controllers: [
    JobTitlesController,
    EmployeesController,
    EmployeeMaintenanceController,
    CostCentersController,
    DepartmentsController,
    ProjectsController,
  ],
  providers: [
    JobTitleService,
    EmployeeManualService,
    EmployeeMaintenanceService,
    CostCenterService,
    DepartmentQueryService,
    DepartmentService,
    DepartmentHeadService,
    ProjectService,
    ProjectRepo,
  ],
})
export class OrganizationHttpModule {}
