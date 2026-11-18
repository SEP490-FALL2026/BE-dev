import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { FORBIDDEN_ERROR } from '../../http/errors/access-errors';
import { ApiException } from '../../http/errors/api.exception';
import { ALSO_GRANTED_ROLES_METADATA, REQUIRED_ROLES_METADATA } from '../decorators/access.decorators';
import { AUTHENTICATED_IDENTITY } from '../models/current-principal';
import type { AuthenticatedPrincipal } from '../tokens/access-token-verifier.port';

type AuthenticatedRequest = Request & { [AUTHENTICATED_IDENTITY]?: AuthenticatedPrincipal };

/**
 * Role check, after authentication. A route with `@RequireRoles(...)` needs the caller to hold
 * at least one of the roles (effective roles, evaluated this request), or, when the route also names grants
 * (`RequireRolesOrGrants`), holds one of those grants. Routes that are public
 * or authenticated-only pass through. Authentication is not authorization: nothing here lets a
 * role skip the business rules a handler enforces.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly string[] | undefined>(REQUIRED_ROLES_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const granted =
      this.reflector.getAllAndOverride<readonly string[] | undefined>(ALSO_GRANTED_ROLES_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>()[AUTHENTICATED_IDENTITY];
    const admitted =
      principal !== undefined &&
      (required.some((role) => principal.roles.includes(role)) ||
        granted.some((role) => principal.directRoles.includes(role)));
    if (!admitted) {
      throw new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR);
    }

    return true;
  }
}
