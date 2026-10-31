import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CostCenterCatalogueService } from './cost-center/cost-center-catalogue.service';
import { CostCenterRepo } from './cost-center/cost-center.repo';
import { DepartmentRecordService } from './department/department-record.service';
import { DepartmentHeadRepo } from './department/department-head.repo';
import { DepartmentRepo } from './department/department.repo';
import { DepartmentUseService } from './department/department-use.service';
import { EmployeeRecordService } from './employee/employee-record.service';
import { EmployeeDepartureRepo } from './employee/employee-departure.repo';
import { EmployeeRepo } from './employee/employee.repo';
import { ImportLookupRepo } from './employee/import-lookup.repo';
import { AnnouncementRepo } from './change-announcement/announcement.repo';
import { OrganizationChangeService } from './change-announcement/organization-change.service';
import { OrganizationHistoryApi } from './public/organization-history.api';
import { OrganizationContextService } from './organization-context.service';
import { OrganizationRepo } from './organization.repo';
import { OrganizationApi } from './public/organization.api';
import { OrganizationReadApi } from './public/organization-read.api';
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
    OrganizationReadApi,
    OrganizationContextService,
    OrganizationRepo,
    CostCenterRepo,
    CostCenterCatalogueService,
    DepartmentRepo,
    DepartmentHeadRepo,
    DepartmentRecordService,
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
    EmployeeRecordService,
    EmployeeRepo,
    EmployeeDepartureRepo,
  ],
  // OrganizationApi (writes, and the readers of what keeps a department or a Cost Center in use) and OrganizationReadApi (reads) are the
  // facades other modules use. EmployeeRepo, ImportLookupRepo and
  // DepartmentHeadRepo stay private behind their capability services. The capability services the use cases of
  // `OrganizationHttpModule` call (the context, the directories of departments and employees, the use readers and the announcement
  // of changes) are exported for that module in the same folder, so no use case goes through the facade. The three exported
  // repos stay exported under an Owner decision (a scoped legacy exception, reviewed at G3), so `OrganizationHttpModule`
  // in the same folder shares one instance: CostCenterService injects CostCenterRepo; DepartmentService,
  // DepartmentQueryService and DepartmentHeadService inject DepartmentRepo. OrganizationRepo has no HTTP consumer
  // since the use cases left the facade; that exception keeps its export until G3 reviews the decision. The extension points (`public/organization.extension-points.ts`)
  // are exported so the modules above bind or add to the one instance of the application.
  exports: [
    OrganizationApi,
    OrganizationReadApi,
    OrganizationHistoryApi,
    OrganizationContextService,
    DepartmentRecordService,
    DepartmentUseService,
    EmployeeRecordService,
    OrganizationChangeService,
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
