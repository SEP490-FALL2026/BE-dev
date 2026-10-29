import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CostCenterCatalogueService } from './cost-center/cost-center-catalogue.service';
import { CostCenterRepo } from './cost-center/cost-center.repo';
import { DepartmentDirectoryService } from './department/department-directory.service';
import { DepartmentHeadRepo } from './department/department-head.repo';
import { DepartmentRepo } from './department/department.repo';
import { DepartmentUseService } from './department/department-use.service';
import { EmployeeDirectoryService } from './employee/employee-directory.service';
import { EmployeeDepartureRepo } from './employee/employee-departure.repo';
import { EmployeeRepo } from './employee/employee.repo';
import { ImportLookupRepo } from './employee/import-lookup.repo';
import { AnnouncementRepo } from './change-announcement/announcement.repo';
import { OrganizationChangeService } from './change-announcement/organization-change.service';
import { OrganizationHistoryApi } from './public/organization-history.api';
import { OrganizationRepo } from './organization.repo';
import { OrganizationApi } from './public/organization.api';
import {
  CostCenterUseContributions,
  DepartmentServiceAccountReaderHook,
  DepartmentUseContributions,
  EmployeeAccountsHook,
  OrganizationChangeListeners,
} from './public/organization.extension-points';

@Module({
  imports: [DatabaseModule],
  providers: [
    OrganizationApi,
    OrganizationRepo,
    CostCenterRepo,
    CostCenterCatalogueService,
    DepartmentRepo,
    DepartmentHeadRepo,
    DepartmentDirectoryService,
    DepartmentUseService,
    OrganizationChangeListeners,
    DepartmentUseContributions,
    CostCenterUseContributions,
    DepartmentServiceAccountReaderHook,
    EmployeeAccountsHook,
    OrganizationChangeService,
    AnnouncementRepo,
    OrganizationHistoryApi,
    ImportLookupRepo,
    EmployeeDirectoryService,
    EmployeeRepo,
    EmployeeDepartureRepo,
  ],
  // OrganizationApi is the facade other modules use. EmployeeRepo, ImportLookupRepo and
  // DepartmentHeadRepo stay private behind their capability services, which only the facade injects. The three exported
  // repos stay exported under Owner decision E4 (a scoped legacy exception, reviewed at G3), so `OrganizationHttpModule`
  // in the same folder shares one instance: CostCenterService injects CostCenterRepo; DepartmentService,
  // DepartmentQueryService and DepartmentHeadService inject DepartmentRepo. OrganizationRepo has no HTTP consumer
  // since Wave 2; E4 keeps its export until G3 reviews the decision. The extension points (`public/organization.extension-points.ts`)
  // are exported so the modules above bind or add to the one instance of the application.
  exports: [
    OrganizationApi,
    OrganizationHistoryApi,
    OrganizationRepo,
    CostCenterRepo,
    DepartmentRepo,
    OrganizationChangeListeners,
    DepartmentUseContributions,
    CostCenterUseContributions,
    DepartmentServiceAccountReaderHook,
    EmployeeAccountsHook,
  ],
})
export class OrganizationModule {}
