import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationModule } from '../organization/organization.module';
import { AccessBlockRepo } from './access-block/access-block.repo';
import { AccessBlockService } from './access-block/access-block.service';
import { AccountLoginEmailFollowService } from './accounts/account-login-email-follow.service';
import { AccountRecordService } from './accounts/account-record.service';
import { ActionLinkService } from './accounts/action-link.service';
import { ActionTokenRepo } from './accounts/action-token.repo';
import { AppUserRepo } from './accounts/app-user.repo';
import { CredentialRepo } from './credentials/credential.repo';
import { CredentialService } from './credentials/credential.service';
import { ProfileRepo } from './profile/profile.repo';
import { PasswordHasher } from './credentials/password-hasher.service';
import { RoleGrantRepo } from './accounts/role-grant.repo';
import { RoleGrantService } from './accounts/role-grant.service';
import { SuperAdminHolderRepo } from './accounts/super-admin-holder.repo';
import { IdentityAccessApi } from './public/identity-access.api';
import { RequestPartyEligibilityApi } from './public/request-party-eligibility.api';
import { RequestPartyEligibilityService } from './request-party/request-party-eligibility.service';
import {
  ApprovalRoleChangeListeners,
  PendingPolicyAcknowledgements,
  SpendingApproverGrantChecks,
} from './public/identity-access.extension-points';

/**
 * IdentityAccessApi is the public facade installation and the worker use. The account persistence is declared
 * here once, because every graph needs it (API, worker, installation, recovery); the API and the recovery command reach
 * it only through the account contracts exported below. No repository, hasher or helper is exported. The change listeners of the
 * approval roles and the checks of the grant of SPENDING_APPROVER are held here once per graph. `EmployeeAccountsListener` (which binds the organization's
 * `EmployeeAccountsHook`, D5) is in `IdentityAccessModule`, not here: only the API loads the use cases that read the hook, and it queues mail, which the CLI graphs never load.
 */
@Module({
  imports: [DatabaseModule, OrganizationModule, AuditModule],
  providers: [
    AppUserRepo,
    AccessBlockRepo,
    CredentialRepo,
    RoleGrantRepo,
    SuperAdminHolderRepo,
    ActionTokenRepo,
    ApprovalRoleChangeListeners,
    SpendingApproverGrantChecks,
    PendingPolicyAcknowledgements,
    ProfileRepo,
    PasswordHasher,
    AccountRecordService,
    AccountLoginEmailFollowService,
    AccessBlockService,
    RoleGrantService,
    ActionLinkService,
    CredentialService,
    IdentityAccessApi,
    RequestPartyEligibilityService,
    RequestPartyEligibilityApi,
  ],
  exports: [
    IdentityAccessApi,
    RequestPartyEligibilityApi,
    AccountRecordService,
    AccountLoginEmailFollowService,
    AccessBlockService,
    RoleGrantService,
    ActionLinkService,
    CredentialService,
    ApprovalRoleChangeListeners,
    SpendingApproverGrantChecks,
    PendingPolicyAcknowledgements,
    ProfileRepo,
  ],
})
export class IdentityAccessFacadeModule {}
