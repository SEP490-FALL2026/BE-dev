import { SetMetadata } from '@nestjs/common';

export const IS_AUTHENTICATED_ONLY_METADATA = Symbol('IS_AUTHENTICATED_ONLY_METADATA');
export const REQUIRED_ROLES_METADATA = Symbol('REQUIRED_ROLES_METADATA');

/**
 * Any signed-in account may call this route; no role is required. Use it for self-service
 * routes such as `/me`. It is a deliberate declaration, not a default.
 */
export const AuthenticatedOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_AUTHENTICATED_ONLY_METADATA, true);

/** The caller needs at least one of these effective roles (OR). A wrong role is a 403. */
export const RequireRoles = (...roles: [string, ...string[]]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES_METADATA, roles);
