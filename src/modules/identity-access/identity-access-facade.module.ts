import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { OrganizationModule } from '../organization/organization.module';
import { AccountDirectoryService } from './accounts/account-directory.service';
import { ActionLinkService } from './accounts/action-link.service';
import { ActionTokenRepo } from './accounts/action-token.repo';
import { AppUserRepo } from './accounts/app-user.repo';
import { CredentialRepo } from './credentials/credential.repo';
import { CredentialService } from './credentials/credential.service';
import { EmployeeAccountsListener } from './accounts/employee-accounts.listener';
import { PasswordHasher } from './credentials/password-hasher.service';
import { RoleGrantRepo } from './accounts/role-grant.repo';
import { RoleGrantService } from './accounts/role-grant.service';
import { SuperAdminHolderRepo } from './accounts/super-admin-holder.repo';
import { ApprovalRoleHoldersService } from './approval-roles/approval-role-holders.service';
import { ApprovalRoleReaderRepo } from './approval-roles/approval-role-reader.repo';
import { IdentityAccessApi } from './public/identity-access.api';
import { ApprovalRoleChangeListeners } from './public/identity-access.extension-points';

/**
 * IdentityAccessApi is the public facade installation and the worker use. The account persistence is declared
 * here once, because every graph needs it (API, worker, installation, recovery); the API and the recovery command reach
 * it only through the account contracts exported below. No repository, hasher or helper is exported. The change listeners of the
 * approval roles are held here once per graph, and `EmployeeAccountsListener` binds the organization's `EmployeeAccountsHook` to
 * the facade (D5) in every graph that loads it.
 */
@Module({
  imports: [DatabaseModule, OrganizationModule],
  providers: [
    AppUserRepo,
    CredentialRepo,
    RoleGrantRepo,
    SuperAdminHolderRepo,
    ActionTokenRepo,
    ApprovalRoleReaderRepo,
    ApprovalRoleHoldersService,
    ApprovalRoleChangeListeners,
    PasswordHasher,
    AccountDirectoryService,
    RoleGrantService,
    ActionLinkService,
    CredentialService,
    IdentityAccessApi,
    EmployeeAccountsListener,
  ],
  exports: [
    IdentityAccessApi,
    AccountDirectoryService,
    RoleGrantService,
    ActionLinkService,
    CredentialService,
    ApprovalRoleChangeListeners,
  ],
})
export class IdentityAccessFacadeModule {}
