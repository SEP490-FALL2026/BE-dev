import { DynamicModule, Logger, Module, Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessDeclarationGuard } from './guards/access-declaration.guard';
import { AuthenticationGuard } from './guards/authentication.guard';
import { AuthorizationGuard } from './guards/authorization.guard';
import { createRateLimitOptions } from './rate-limit.options';

export interface SecurityModuleOptions {
  /**
   * A module that exports `ACCESS_TOKEN_VERIFIER`. Passed in rather than imported here so
   * infrastructure never depends on a business module; the application module wires it.
   */
  verifierModule: Type<unknown>;
}

@Module({})
export class SecurityModule {
  static register(options: SecurityModuleOptions): DynamicModule {
    return {
      module: SecurityModule,
      imports: [
        ThrottlerModule.forRootAsync({ inject: [ConfigService], useFactory: createRateLimitOptions }),
        options.verifierModule,
      ],
      providers: [
        Logger,
        AccessDeclarationGuard,
        AuthenticationGuard,
        AuthorizationGuard,
        // Order matters: rate limiting first, then the declaration check (fail closed on a
        // route that forgot to declare), then who the caller is, then what they may do.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useExisting: AccessDeclarationGuard },
        { provide: APP_GUARD, useExisting: AuthenticationGuard },
        { provide: APP_GUARD, useExisting: AuthorizationGuard },
      ],
      exports: [AuthenticationGuard, AuthorizationGuard],
    };
  }
}
