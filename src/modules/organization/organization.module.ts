import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CostCenterCatalogueService } from './cost-center/cost-center-catalogue.service';
import { CostCenterRepo } from './cost-center/cost-center.repo';
import { DepartmentDirectoryService } from './department/department-directory.service';
import { DepartmentHeadRepo } from './department/department-head.repo';
import { DepartmentRepo } from './department/department.repo';
import { EmployeeDirectoryService } from './employee/employee-directory.service';
import { EmployeeRepo } from './employee/employee.repo';
import { ImportLookupRepo } from './employee/import-lookup.repo';
import { JobTitleCatalogueService } from './job-title/job-title-catalogue.service';
import { JobTitleRepo } from './job-title/job-title.repo';
import { OrganizationRepo } from './organization.repo';
import { OrganizationService } from './organization.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    OrganizationService,
    OrganizationRepo,
    CostCenterRepo,
    CostCenterCatalogueService,
    DepartmentRepo,
    DepartmentHeadRepo,
    DepartmentDirectoryService,
    ImportLookupRepo,
    EmployeeDirectoryService,
    EmployeeRepo,
    JobTitleCatalogueService,
    JobTitleRepo,
  ],
  // OrganizationService is the facade other modules use. JobTitleRepo, EmployeeRepo, ImportLookupRepo and
  // DepartmentHeadRepo stay private behind their capability services, which only the facade injects. The three exported
  // repos stay exported under Owner decision E4 (a scoped legacy exception, reviewed at G3), so `OrganizationHttpModule`
  // in the same folder shares one instance: CostCenterService injects CostCenterRepo; DepartmentService,
  // DepartmentQueryService and DepartmentHeadService inject DepartmentRepo. OrganizationRepo has no HTTP consumer
  // since Wave 2; E4 keeps its export until G3 reviews the decision.
  exports: [OrganizationService, OrganizationRepo, CostCenterRepo, DepartmentRepo],
})
export class OrganizationModule {}
