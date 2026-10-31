import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ApprovalRoleFactsService } from './approval-roles/approval-role-facts.service';
import { ApprovalRoleRepo } from './approval-roles/approval-role.repo';
import { IdentityAccessFacadeModule } from './identity-access-facade.module';
import { IdentityAccessInspectionApi } from './public/identity-access-inspection.api';

/**
 * The account side of `ops:inspect`. Only the inspection graph loads it (module-graph.spec.ts), so the approval
 * role persistence it declares appears once per graph, as in IdentityAccessRecoveryCliModule. Exports the read-only contract alone.
 */
@Module({
  imports: [DatabaseModule, IdentityAccessFacadeModule],
  providers: [ApprovalRoleRepo, ApprovalRoleFactsService, IdentityAccessInspectionApi],
  exports: [IdentityAccessInspectionApi],
})
export class IdentityAccessInspectionFacadeModule {}
