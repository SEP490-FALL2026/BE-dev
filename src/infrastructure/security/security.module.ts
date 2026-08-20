import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env-schema';
import { AuthenticationGuard } from './guards/authentication.guard';
import { ACCESS_TOKEN_VERIFIER } from './tokens/access-token-verifier.port';
import { OidcJwtVerifier } from './tokens/oidc-jwt.verifier';

@Module({
  providers: [
    AuthenticationGuard,
    { provide: APP_GUARD, useExisting: AuthenticationGuard },
    {
      provide: ACCESS_TOKEN_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>): OidcJwtVerifier =>
        new OidcJwtVerifier({
          issuer: config.getOrThrow<string>('OIDC_ISSUER'),
          audience: config.getOrThrow<string>('OIDC_AUDIENCE'),
          jwksUri: config.getOrThrow<string>('OIDC_JWKS_URI'),
        }),
    },
  ],
  exports: [ACCESS_TOKEN_VERIFIER, AuthenticationGuard],
})
export class SecurityModule {}
