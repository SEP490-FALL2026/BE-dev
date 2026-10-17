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
import { AppUsersController } from './accounts/app-users.controller';
import { JwtAccessTokenVerifier } from './access/jwt-access-token.verifier';
import { MeController } from './access/me.controller';
import { MeService } from './access/me.service';
import { ApprovalRolesController } from './approval-roles/approval-roles.controller';
import { ApprovalRoleService } from './approval-roles/approval-role.service';
import { SuperAdminTransferService } from './accounts/super-admin-transfer.service';
import { SuperAdminTransfersController } from './accounts/super-admin-transfers.controller';
import { AuthController } from './auth/auth.controller';
import { CredentialChangeService } from './auth/credential-change.service';
import { LoginService } from './auth/login.service';
import { LoginThrottle } from './auth/login-throttle.service';
import { PasswordChangeService } from './auth/password-change.service';
import { PasswordResetService } from './auth/password-reset.service';
import { SessionRepo } from './auth/session.repo';
import { SessionService } from './auth/session.service';
import { TokenService } from './auth/token.service';
import { IdentityAccessFacadeModule } from './identity-access-facade.module';

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
    ApprovalRoleService,
    SuperAdminTransferService,
    AccountQueryService,
    AccountInvitationService,
    AccountStatusService,
    CredentialChangeService,
    LoginService,
    LoginThrottle,
    PasswordChangeService,
    PasswordResetService,
    SessionService,
    SessionRepo,
    MeService,
    TokenService,
    JwtAccessTokenVerifier,
    { provide: ACCESS_TOKEN_VERIFIER, useExisting: JwtAccessTokenVerifier },
  ],
  exports: [ACCESS_TOKEN_VERIFIER],
})
export class IdentityAccessModule {}
