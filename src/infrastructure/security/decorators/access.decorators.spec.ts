import { DECORATORS } from '@nestjs/swagger';
import {
  AuthenticatedOnly,
  IS_AUTHENTICATED_ONLY_METADATA,
  REQUIRED_ROLES_METADATA,
  RequireRoles,
} from './access.decorators';
import { IS_PUBLIC_METADATA, Public } from './public.decorator';

const BEARER_REQUIREMENT = [{ bearer: [] }];

class Routes {
  @AuthenticatedOnly()
  self(): void {}

  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  admin(): void {}

  @Public()
  open(): void {}
}

@RequireRoles('IT_ADMIN')
class RoleController {}

@AuthenticatedOnly()
class SelfServiceController {}

const handler = (name: keyof Routes): object =>
  Object.getOwnPropertyDescriptor(Routes.prototype, name)?.value as object;
const metadata = (key: unknown, target: object): unknown => Reflect.getMetadata(key, target);

describe('access decorators — the guard metadata and the OpenAPI security they imply', () => {
  it('@AuthenticatedOnly keeps the guard flag and documents the bearer requirement on a handler', () => {
    expect(metadata(IS_AUTHENTICATED_ONLY_METADATA, handler('self'))).toBe(true);
    expect(metadata(DECORATORS.API_SECURITY, handler('self'))).toEqual(BEARER_REQUIREMENT);
  });

  it('@RequireRoles keeps the exact roles for the guard and documents the bearer requirement on a handler', () => {
    expect(metadata(REQUIRED_ROLES_METADATA, handler('admin'))).toEqual(['SUPER_ADMIN', 'IT_ADMIN']);
    expect(metadata(DECORATORS.API_SECURITY, handler('admin'))).toEqual(BEARER_REQUIREMENT);
  });

  it('applies the same way when declared on a controller class', () => {
    expect(metadata(REQUIRED_ROLES_METADATA, RoleController)).toEqual(['IT_ADMIN']);
    expect(metadata(DECORATORS.API_SECURITY, RoleController)).toEqual(BEARER_REQUIREMENT);
    expect(metadata(IS_AUTHENTICATED_ONLY_METADATA, SelfServiceController)).toBe(true);
    expect(metadata(DECORATORS.API_SECURITY, SelfServiceController)).toEqual(BEARER_REQUIREMENT);
  });

  it('@Public documents no security requirement', () => {
    expect(metadata(IS_PUBLIC_METADATA, handler('open'))).toBe(true);
    expect(metadata(DECORATORS.API_SECURITY, handler('open'))).toBeUndefined();
  });
});
