import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { EnvironmentVariables } from '../../infrastructure/config/env-schema';
import { ACCESS_TOKEN_VERIFIER } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationModule } from '../organization/organization.module';
import { AccountManagementService } from './account-management.service';
import { AppUsersController } from './app-users.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdentityAccessRepo } from './identity-access.repo';
import { IdentityAccessService } from './identity-access.service';
import { JwtAccessTokenVerifier } from './jwt-access-token.verifier';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { PasswordHasher } from './password-hasher.service';
import { RefreshCookie } from './refresh-cookie';
import { TokenService } from './token.service';

@Module({
  imports: [
    DatabaseModule,
    OrganizationModule,
    AuditModule,
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
  controllers: [AuthController, MeController, AppUsersController],
  providers: [
    IdentityAccessRepo,
    IdentityAccessService,
    AccountManagementService,
    AuthService,
    MeService,
    PasswordHasher,
    TokenService,
    RefreshCookie,
    JwtAccessTokenVerifier,
    { provide: ACCESS_TOKEN_VERIFIER, useExisting: JwtAccessTokenVerifier },
  ],
  exports: [ACCESS_TOKEN_VERIFIER, IdentityAccessService, AccountManagementService],
})
export class IdentityAccessModule {}
