import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CostCenterCatalogueService } from './cost-center/cost-center-catalogue.service';
import { CostCenterRepo } from './cost-center/cost-center.repo';
import { DepartmentRepo } from './department.repo';
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
    ImportLookupRepo,
    EmployeeDirectoryService,
    EmployeeRepo,
    JobTitleCatalogueService,
    JobTitleRepo,
  ],
  // OrganizationService is the facade other modules use. JobTitleRepo, EmployeeRepo and ImportLookupRepo stay private
  // behind their capability services, which only the facade injects. The three exported repos stay exported under Owner
  // decision E4, reviewed at H4.7, so `OrganizationHttpModule` in the same folder shares one instance: CostCenterService
  // injects CostCenterRepo and DepartmentService injects DepartmentRepo. OrganizationRepo has no HTTP consumer since
  // Wave 2 and stays exported only until the H4.7/E4 review.
  exports: [OrganizationService, OrganizationRepo, CostCenterRepo, DepartmentRepo],
})
export class OrganizationModule {}
