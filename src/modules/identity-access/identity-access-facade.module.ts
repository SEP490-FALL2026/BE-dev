import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { OrganizationModule } from '../organization/organization.module';
import { AccountRepo } from './accounts/account.repo';
import { PasswordHasher } from './auth/password-hasher.service';
import { IdentityAccessService } from './identity-access.service';

/**
 * IdentityAccessService is the public facade installation and the worker use. The repo and the
 * hasher are exported only so IdentityAccessModule, in the same folder and owned by the same table
 * owner, shares one instance of each instead of declaring a second copy.
 */
@Module({
  imports: [DatabaseModule, OrganizationModule],
  providers: [AccountRepo, PasswordHasher, IdentityAccessService],
  exports: [IdentityAccessService, AccountRepo, PasswordHasher],
})
export class IdentityAccessFacadeModule {}
