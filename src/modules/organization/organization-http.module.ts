import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { CostCenterService } from './cost-center.service';
import { CostCentersController } from './cost-centers.controller';
import { DepartmentService } from './department.service';
import { DepartmentsController } from './departments.controller';
import { EmployeeManualService } from './employee-manual.service';
import { EmployeesController } from './employees.controller';
import { JobTitleService } from './job-title.service';
import { JobTitlesController } from './job-titles.controller';
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
    CostCentersController,
    DepartmentsController,
    ProjectsController,
  ],
  providers: [
    JobTitleService,
    EmployeeManualService,
    CostCenterService,
    DepartmentService,
    ProjectService,
    ProjectRepo,
  ],
})
export class OrganizationHttpModule {}
