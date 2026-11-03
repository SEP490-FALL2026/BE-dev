import { ExecutionContext, Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../../http/errors/api.exception';
import { AuthenticatedOnly, RequireRoles } from '../decorators/access.decorators';
import { Public } from '../decorators/public.decorator';
import { AUTHENTICATED_IDENTITY } from '../models/current-principal';
import type { AuthenticatedPrincipal } from '../tokens/access-token-verifier.port';
import { AccessDeclarationGuard } from './access-declaration.guard';
import { AuthorizationGuard } from './authorization.guard';

@Controller('declared-public')
@Public()
class PublicController {
  @Get() handler(): void {}
}

@Controller('mixed-class-handler')
@Public()
class ClassPublicHandlerRolesController {
  // Different kinds at class and handler level are ambiguous (the other guards read each level
  // independently), so they are refused rather than resolved.
  @Get() @RequireRoles('IT_ADMIN') handler(): void {}
}

@Controller('same-kind')
@AuthenticatedOnly()
class SameKindController {
  @Get() @AuthenticatedOnly() handler(): void {}
}

@Controller('probe')
class ProbeController {
  @Get() undeclared(): void {}
  @Get() @Public() publicRoute(): void {}
  @Get() @AuthenticatedOnly() selfService(): void {}
  @Get() @RequireRoles('IT_ADMIN', 'FINANCE') roles(): void {}
  @Get() @Public() @AuthenticatedOnly() conflicting(): void {}
}

function contextOf(controller: new () => object, handlerName: string, principal?: AuthenticatedPrincipal) {
  const request = { [AUTHENTICATED_IDENTITY]: principal };

  return {
    getClass: () => controller,
    getHandler: () => (controller.prototype as Record<string, () => void>)[handlerName],
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const principal = (roles: string[]): AuthenticatedPrincipal => ({
  subject: 'u1',
  appUserId: 'u1',
  sessionId: 's1',
  employeeId: 'e1',
  directRoles: roles,
  roles,
});

describe('AccessDeclarationGuard (fail closed)', () => {
  const guard = new AccessDeclarationGuard(new Reflector());

  it.each(['publicRoute', 'selfService', 'roles'])('accepts a route that declares exactly one rule: %s', (name) => {
    expect(guard.canActivate(contextOf(ProbeController, name))).toBe(true);
  });

  it('refuses a route with no declaration', () => {
    expect(() => guard.canActivate(contextOf(ProbeController, 'undeclared'))).toThrow(/no valid access declaration/);
  });

  it('refuses a route that declares two different kinds', () => {
    expect(() => guard.canActivate(contextOf(ProbeController, 'conflicting'))).toThrow(/no valid access declaration/);
  });

  it('accepts a class-level declaration and the same kind repeated on the handler', () => {
    expect(guard.canActivate(contextOf(PublicController, 'handler'))).toBe(true);
    expect(guard.canActivate(contextOf(SameKindController, 'handler'))).toBe(true);
  });

  it('refuses different kinds on class and handler instead of letting one guard read the class and another the handler', () => {
    expect(() => guard.canActivate(contextOf(ClassPublicHandlerRolesController, 'handler'))).toThrow(
      /no valid access declaration/,
    );
  });
});

describe('AuthorizationGuard', () => {
  const guard = new AuthorizationGuard(new Reflector());

  it('lets public and authenticated-only routes through without looking at roles', () => {
    expect(guard.canActivate(contextOf(ProbeController, 'publicRoute'))).toBe(true);
    expect(guard.canActivate(contextOf(ProbeController, 'selfService', principal([])))).toBe(true);
  });

  it('allows a caller holding any one of the required roles (OR)', () => {
    expect(guard.canActivate(contextOf(ProbeController, 'roles', principal(['FINANCE'])))).toBe(true);
    expect(guard.canActivate(contextOf(ProbeController, 'roles', principal(['EMPLOYEE', 'IT_ADMIN'])))).toBe(true);
  });

  it('answers 403 AUTHORIZATION.FORBIDDEN for a caller with none of them', () => {
    const attempt = () => guard.canActivate(contextOf(ProbeController, 'roles', principal(['EMPLOYEE'])));

    expect(attempt).toThrow(ApiException);
    try {
      attempt();
    } catch (error) {
      expect((error as ApiException).getStatus()).toBe(403);
      expect((error as ApiException).getResponse()).toMatchObject({ code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  it('refuses a caller with no roles at all on a role route (self-service only)', () => {
    expect(() => guard.canActivate(contextOf(ProbeController, 'roles', principal([])))).toThrow(ApiException);
  });
});
