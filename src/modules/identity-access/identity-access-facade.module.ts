import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { OrganizationModule } from '../organization/organization.module';
import { AccountRepo } from './accounts/account.repo';
import { SuccessorEligibility } from './accounts/successor-eligibility';
import { ApprovalRoleRepo } from './approval-roles/approval-role.repo';
import { PasswordHasher } from './auth/password-hasher.service';
import { RecoveryRepo } from './recovery.repo';
import { IdentityAccessService } from './identity-access.service';

/**
 * IdentityAccessService is the public facade installation and the worker use. The repos, the hasher and the
 * successor check are exported only so IdentityAccessModule and RecoveryModule, in the same folder and owned by
 * the same table owner, share one instance of each instead of declaring a second copy.
 */
@Module({
  imports: [DatabaseModule, OrganizationModule],
  providers: [AccountRepo, PasswordHasher, ApprovalRoleRepo, SuccessorEligibility, RecoveryRepo, IdentityAccessService],
  exports: [IdentityAccessService, AccountRepo, PasswordHasher, ApprovalRoleRepo, SuccessorEligibility, RecoveryRepo],
})
export class IdentityAccessFacadeModule {}
