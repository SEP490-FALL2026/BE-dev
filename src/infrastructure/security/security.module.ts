import { DynamicModule, Logger, Module, Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccessDeclarationGuard } from './guards/access-declaration.guard';
import { AuthenticationGuard } from './guards/authentication.guard';
import { AuthorizationGuard } from './guards/authorization.guard';
import { CredentialThrottlerGuard } from './guards/credential-throttler.guard';
import { DeviceAuthenticationGuard } from './guards/device-authentication.guard';
import { createRateLimitOptions } from './rate-limit.options';
import { DEVICE_CREDENTIAL_VERIFIER, REJECT_EVERY_DEVICE_CREDENTIAL } from './tokens/device-credential-verifier.port';

export interface SecurityModuleOptions {
  /**
   * A module that exports `ACCESS_TOKEN_VERIFIER`. Passed in rather than imported here so
   * infrastructure never depends on a business module; the application module wires it.
   */
  verifierModule: Type<unknown>;
  /**
   * A module that exports `DEVICE_CREDENTIAL_VERIFIER`, passed in for the same reason. An application that does not carry device
   * credentials leaves it out and every device credential is refused.
   */
  deviceVerifierModule?: Type<unknown>;
}

@Module({})
export class SecurityModule {
  static register(options: SecurityModuleOptions): DynamicModule {
    return {
      module: SecurityModule,
      imports: [
        ThrottlerModule.forRootAsync({ inject: [ConfigService], useFactory: createRateLimitOptions }),
        options.verifierModule,
        ...(options.deviceVerifierModule ? [options.deviceVerifierModule] : []),
      ],
      providers: [
        Logger,
        ...(options.deviceVerifierModule
          ? []
          : [{ provide: DEVICE_CREDENTIAL_VERIFIER, useValue: REJECT_EVERY_DEVICE_CREDENTIAL }]),
        AccessDeclarationGuard,
        AuthenticationGuard,
        DeviceAuthenticationGuard,
        AuthorizationGuard,
        CredentialThrottlerGuard,
        // Order matters: rate limiting first, then the declaration check (fail closed on a
        // route that forgot to declare), then who the caller is (a person, or a device on its own routes), then what they may do.
        { provide: APP_GUARD, useExisting: CredentialThrottlerGuard },
        { provide: APP_GUARD, useExisting: AccessDeclarationGuard },
        { provide: APP_GUARD, useExisting: AuthenticationGuard },
        { provide: APP_GUARD, useExisting: DeviceAuthenticationGuard },
        { provide: APP_GUARD, useExisting: AuthorizationGuard },
      ],
      exports: [AuthenticationGuard, AuthorizationGuard],
    };
  }
}
