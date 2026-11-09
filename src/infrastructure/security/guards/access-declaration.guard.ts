import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_AUTHENTICATED_ONLY_METADATA, REQUIRED_ROLES_METADATA } from '../decorators/access.decorators';
import { IS_DEVICE_AUTHENTICATED_METADATA } from '../decorators/device-authenticated.decorator';
import { IS_PUBLIC_METADATA } from '../decorators/public.decorator';

/**
 * Fail closed: every route must declare exactly one of @Public(), @AuthenticatedOnly() or
 * @RequireRoles(...) or @DeviceAuthenticated(). A route that declares none, or two different kinds, is a programming
 * error and answers 500 with an operator log instead of silently becoming public or private.
 * Runs before authentication so the mistake shows up the same way for every caller.
 *
 * Declaring on the class alone, the handler alone, or the same kind on both is fine; two different
 * kinds (one per level) are refused.
 */
@Injectable()
export class AccessDeclarationGuard implements CanActivate {
  private readonly logger = new Logger(AccessDeclarationGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const onHandler = this.declarations(context.getHandler());
    const onClass = this.declarations(context.getClass());
    // The authentication and authorization guards each read both levels on their own, so a
    // handler and class that declare different kinds would be applied inconsistently. Same kind
    // at both levels is harmless; different kinds are refused.
    const conflicting = onHandler.length > 0 && onClass.length > 0 && onHandler.join() !== onClass.join();
    const effective = conflicting ? [...onHandler, ...onClass] : onHandler.length > 0 ? onHandler : onClass;

    if (effective.length !== 1) {
      const route = `${context.getClass().name}.${context.getHandler().name}`;
      this.logger.error(`Route ${route} declares ${effective.length} access rules; exactly one is required.`);
      throw new Error(`Route ${route} has no valid access declaration`);
    }

    return true;
  }

  private declarations(target: Parameters<Reflector['get']>[1]): string[] {
    const kinds: Array<[symbol, string]> = [
      [IS_PUBLIC_METADATA, 'public'],
      [IS_AUTHENTICATED_ONLY_METADATA, 'authenticated'],
      [REQUIRED_ROLES_METADATA, 'roles'],
      [IS_DEVICE_AUTHENTICATED_METADATA, 'device'],
    ];

    return kinds.filter(([key]) => this.reflector.get(key, target) !== undefined).map(([, kind]) => kind);
  }
}
