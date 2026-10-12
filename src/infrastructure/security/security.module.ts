import { Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthenticationGuard } from './guards/authentication.guard';
import { createRateLimitOptions } from './rate-limit.options';
import { ACCESS_TOKEN_VERIFIER } from './tokens/access-token-verifier.port';
import { UnconfiguredTokenVerifier } from './tokens/unconfigured-token.verifier';

@Module({
  imports: [ThrottlerModule.forRootAsync({ inject: [ConfigService], useFactory: createRateLimitOptions })],
  providers: [
    Logger,
    AuthenticationGuard,
    // Rate limiting runs before authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthenticationGuard },
    { provide: ACCESS_TOKEN_VERIFIER, useClass: UnconfiguredTokenVerifier },
  ],
  exports: [ACCESS_TOKEN_VERIFIER, AuthenticationGuard],
})
export class SecurityModule {}
