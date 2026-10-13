import { Controller, Get } from '@nestjs/common';
import { RequireRoles } from '../../src/infrastructure/security/decorators/access.decorators';

/**
 * Routes that exist only in HTTP tests, so role changes can be observed through the real guard.
 * Never registered in AppModule, so they never reach OpenAPI or the API manifest.
 */
@Controller({ path: 'probe', version: '1' })
export class RoleProbeController {
  @Get('it')
  @RequireRoles('IT_ADMIN')
  it(): { ok: true } {
    return { ok: true };
  }

  @Get('employee')
  @RequireRoles('EMPLOYEE')
  employee(): { ok: true } {
    return { ok: true };
  }
}
