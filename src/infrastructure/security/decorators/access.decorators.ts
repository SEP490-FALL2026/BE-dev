import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';

export const IS_AUTHENTICATED_ONLY_METADATA = Symbol('IS_AUTHENTICATED_ONLY_METADATA');
export const REQUIRED_ROLES_METADATA = Symbol('REQUIRED_ROLES_METADATA');

/**
 * Any signed-in account may call this route; no role is required. Use it for self-service
 * routes such as `/me`. It is a deliberate declaration, not a default. It also documents the
 * bearer requirement in OpenAPI, so the document follows the same declaration the guard reads.
 */
export const AuthenticatedOnly = (): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(IS_AUTHENTICATED_ONLY_METADATA, true), ApiBearerAuth());

/** The caller needs at least one of these effective roles (OR). A wrong role is a 403. Documents the bearer requirement. */
export const RequireRoles = (...roles: [string, ...string[]]): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(REQUIRED_ROLES_METADATA, roles), ApiBearerAuth());
