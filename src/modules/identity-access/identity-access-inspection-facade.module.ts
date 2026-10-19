import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ApprovalRoleDirectoryService } from './approval-roles/approval-role-directory.service';
import { ApprovalRoleRepo } from './approval-roles/approval-role.repo';
import { IdentityAccessFacadeModule } from './identity-access-facade.module';
import { IdentityAccessInspectionService } from './identity-access.service';

/**
 * The account side of `ops:inspect` (H6.1). Only the inspection graph loads it (module-graph.spec.ts), so the approval
 * role persistence it declares appears once per graph, as in RecoveryModule. Exports the read-only contract alone.
 */
@Module({
  imports: [DatabaseModule, IdentityAccessFacadeModule],
  providers: [ApprovalRoleRepo, ApprovalRoleDirectoryService, IdentityAccessInspectionService],
  exports: [IdentityAccessInspectionService],
})
export class IdentityAccessInspectionFacadeModule {}
