import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { OrganizationModule } from '../organization/organization.module';
import { AccountDirectoryService } from './accounts/account-directory.service';
import { ActionLinkService } from './accounts/action-link.service';
import { ActionTokenRepo } from './accounts/action-token.repo';
import { AppUserRepo } from './accounts/app-user.repo';
import { CredentialRepo } from './accounts/credential.repo';
import { CredentialService } from './accounts/credential.service';
import { PasswordHasher } from './accounts/password-hasher.service';
import { RoleGrantRepo } from './accounts/role-grant.repo';
import { RoleGrantService } from './accounts/role-grant.service';
import { IdentityAccessService } from './identity-access.service';

/**
 * IdentityAccessService is the public facade installation and the worker use. The account persistence is declared
 * here once, because every graph needs it (API, worker, installation, recovery); the API and the recovery command reach
 * it only through the account contracts exported below. No repository, hasher or helper is exported.
 */
@Module({
  imports: [DatabaseModule, OrganizationModule],
  providers: [
    AppUserRepo,
    CredentialRepo,
    RoleGrantRepo,
    ActionTokenRepo,
    PasswordHasher,
    AccountDirectoryService,
    RoleGrantService,
    ActionLinkService,
    CredentialService,
    IdentityAccessService,
  ],
  exports: [IdentityAccessService, AccountDirectoryService, RoleGrantService, ActionLinkService, CredentialService],
})
export class IdentityAccessFacadeModule {}
