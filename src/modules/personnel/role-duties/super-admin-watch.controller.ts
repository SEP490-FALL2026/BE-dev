import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { SuperAdminWatchResponseDto, type SuperAdminWatchWire } from './role-duties.dto';
import { RoleDutiesViewService } from './role-duties-view.service';

/**
 * Whether the Super Admin role can be used now, in four states told apart. The Super Admin and the IT Admin read it; Finance, a head
 * and an employee are refused. It changes no role and no account: only the recovery outside the application brings a role back.
 */
@ApiTags('super-admin-watch')
@Controller({ path: 'super-admin-watch', version: '1' })
@RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
export class SuperAdminWatchController {
  constructor(private readonly view: RoleDutiesViewService) {}

  @Get()
  @ApiOperation({ operationId: 'superAdminWatchGet', summary: 'Read the state of the Super Admin role' })
  @ApiSuccessResponse(SuperAdminWatchResponseDto, {
    message: 'SUPER_ADMIN_WATCH.RETRIEVED',
    description:
      'One of four states: the holder works and can act, the holder is handing over and still can act (with a warning, and a second one once the last working day has passed), the holder cannot act (with every reason: locked, has left, not activated, waiting for the credential reset of an operator), or nobody holds the role. A holder who is handing over is never counted as unable to act because of the day.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the Super Admin and an IT Admin read the state of the Super Admin role.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async get(): Promise<SuperAdminWatchWire> {
    try {
      return await this.view.superAdminWatch();
    } catch (error) {
      throw toUnavailableApiException(error) ?? error;
    }
  }
}
