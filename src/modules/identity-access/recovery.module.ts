import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationModule } from '../organization/organization.module';
import { APPROVAL_ROLE_HOLDINGS } from './accounts/account.types';
import { ACCOUNT_SESSIONS } from './account-sessions.extension-points';
import { ActionLinkRevocation } from './accounts/action-link-revocation.service';
import { SuccessorEligibility } from './accounts/successor-eligibility.service';
import { ApprovalRoleDirectoryService } from './approval-roles/approval-role-directory.service';
import { ApprovalRoleRepo } from './approval-roles/approval-role.repo';
import { SessionDirectoryService } from './auth/session-directory.service';
import { SessionRepo } from './auth/session.repo';
import { IdentityAccessFacadeModule } from './identity-access-facade.module';
import { HolderCredentialReset } from './recovery/holder-credential-reset.service';
import { HolderRecoveryApi } from './public/holder-recovery.api';
import { RecoveryLinks } from './recovery/recovery-links.service';
import { RecoveryTargets } from './recovery/recovery-targets.service';
import { RecoveryRepo } from './recovery/recovery.repo';
import { RoleHandover } from './recovery/role-handover.service';
import { RoleTransferRecoveryApi } from './public/role-transfer-recovery.api';
import { SuccessorEnrolment } from './recovery/successor-enrolment.service';

/**
 * The recovery of the Super Admin role, run by an operator outside the application (`US-01-09` AC-9 → AC-14). It has
 * no controller: nothing in the API reaches it (AC-13). Only the recovery command loads it. The providers it shares
 * with the API (the sessions it ends, E6; the approval roles and the successor check; the ending of links; the
 * tickets) are declared here as they are in IdentityAccessModule: the two graphs never meet, and none is exported.
 */
@Module({
  imports: [DatabaseModule, OrganizationModule, AuditModule, NotificationsModule, IdentityAccessFacadeModule],
  providers: [
    SessionRepo,
    SessionDirectoryService,
    { provide: ACCOUNT_SESSIONS, useExisting: SessionDirectoryService },
    ApprovalRoleRepo,
    ApprovalRoleDirectoryService,
    { provide: APPROVAL_ROLE_HOLDINGS, useExisting: ApprovalRoleDirectoryService },
    SuccessorEligibility,
    ActionLinkRevocation,
    RecoveryRepo,
    RecoveryTargets,
    RecoveryLinks,
    HolderCredentialReset,
    HolderRecoveryApi,
    SuccessorEnrolment,
    RoleHandover,
    RoleTransferRecoveryApi,
  ],
  exports: [HolderRecoveryApi, RoleTransferRecoveryApi],
})
export class RecoveryModule {}
