import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CostCenterRepo } from './cost-center.repo';
import { DepartmentRepo } from './department.repo';
import { ImportLookupRepo } from './import-lookup.repo';
import { OrganizationRepo } from './organization.repo';
import { OrganizationService } from './organization.service';

@Module({
  imports: [DatabaseModule],
  providers: [OrganizationService, OrganizationRepo, CostCenterRepo, DepartmentRepo, ImportLookupRepo],
  // OrganizationService is the facade other modules use. The three repos are exported only so `OrganizationHttpModule`,
  // in the same folder and owned by the same table owner, shares one instance instead of declaring a second (Owner
  // decision E4). ImportLookupRepo stays private: only OrganizationService reads through it.
  exports: [OrganizationService, OrganizationRepo, CostCenterRepo, DepartmentRepo],
})
export class OrganizationModule {}
