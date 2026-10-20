import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { EnvironmentVariables } from '../../infrastructure/config/env-schema';
import { ACCESS_TOKEN_VERIFIER } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationModule } from '../organization/organization.module';
import { AccountInvitationService } from './accounts/account-invitation.service';
import { AccountQueryService } from './accounts/account-query.service';
import { AccountStatusService } from './accounts/account-status.service';
import { APPROVAL_ROLE_HOLDINGS } from './accounts/account.types';
import { ACCOUNT_SESSIONS } from './identity-access.ports';
import { ActionLinkRevocation } from './accounts/action-link-revocation.service';
import { AppUsersController } from './accounts/app-users.controller';
import { InvitationMailService } from './accounts/invitation-mail.service';
import { InvitationRedemptionService } from './accounts/invitation-redemption.service';
import { SuccessorEligibility } from './accounts/successor-eligibility.service';
import { JwtAccessTokenVerifier } from './access/jwt-access-token.verifier';
import { MeController } from './access/me.controller';
import { MeService } from './access/me.service';
import { ApprovalRoleDirectoryService } from './approval-roles/approval-role-directory.service';
import { ApprovalRoleRepo } from './approval-roles/approval-role.repo';
import { ApprovalRolesController } from './approval-roles/approval-roles.controller';
import { ApprovalRoleService } from './approval-roles/approval-role.service';
import { SuperAdminTransferService } from './accounts/super-admin-transfer.service';
import { SuperAdminTransfersController } from './accounts/super-admin-transfers.controller';
import { AuthController } from './auth/auth.controller';
import { CredentialChangeService } from './auth/credential-change.service';
import { LoginService } from './auth/login.service';
import { LoginThrottle } from './auth/login-throttle.service';
import { PasswordChangeService } from './auth/password-change.service';
import { PasswordResetMailService } from './auth/password-reset-mail.service';
import { PasswordResetRedemptionService } from './auth/password-reset-redemption.service';
import { PasswordResetRequestService } from './auth/password-reset-request.service';
import { PasswordResetService } from './auth/password-reset.service';
import { SessionDirectoryService } from './auth/session-directory.service';
import { SessionTokenService } from './auth/session-token.service';
import { SessionRepo } from './auth/session.repo';
import { SessionService } from './auth/session.service';
import { TokenService } from './auth/token.service';
import { IdentityAccessFacadeModule } from './identity-access-facade.module';
import { RecoveryTicketService } from './recovery/recovery-ticket.service';
import { RecoveryRepo } from './recovery/recovery.repo';

@Module({
  imports: [
    DatabaseModule,
    OrganizationModule,
    AuditModule,
    IdentityAccessFacadeModule,
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.get('AUTH_ACCESS_TOKEN_SECRET', { infer: true }),
        // Pinning `algorithms` on verify is what stops `alg: none` and algorithm-confusion tokens.
        signOptions: {
          algorithm: 'HS256' as const,
          issuer: config.get('AUTH_JWT_ISSUER', { infer: true }),
          audience: config.get('AUTH_JWT_AUDIENCE', { infer: true }),
          expiresIn: config.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
        },
        verifyOptions: {
          algorithms: ['HS256' as const],
          issuer: config.get('AUTH_JWT_ISSUER', { infer: true }),
          audience: config.get('AUTH_JWT_AUDIENCE', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [
    AuthController,
    MeController,
    AppUsersController,
    ApprovalRolesController,
    SuperAdminTransfersController,
  ],
  providers: [
    ApprovalRoleRepo,
    ApprovalRoleDirectoryService,
    { provide: APPROVAL_ROLE_HOLDINGS, useExisting: ApprovalRoleDirectoryService },
    ApprovalRoleService,
    SuccessorEligibility,
    SuperAdminTransferService,
    AccountQueryService,
    ActionLinkRevocation,
    InvitationMailService,
    AccountInvitationService,
    InvitationRedemptionService,
    AccountStatusService,
    CredentialChangeService,
    LoginService,
    LoginThrottle,
    PasswordChangeService,
    PasswordResetRequestService,
    PasswordResetMailService,
    PasswordResetService,
    PasswordResetRedemptionService,
    RecoveryRepo,
    RecoveryTicketService,
    SessionService,
    SessionTokenService,
    SessionDirectoryService,
    { provide: ACCOUNT_SESSIONS, useExisting: SessionDirectoryService },
    SessionRepo,
    MeService,
    TokenService,
    JwtAccessTokenVerifier,
    { provide: ACCESS_TOKEN_VERIFIER, useExisting: JwtAccessTokenVerifier },
  ],
  exports: [ACCESS_TOKEN_VERIFIER],
})
export class IdentityAccessModule {}
