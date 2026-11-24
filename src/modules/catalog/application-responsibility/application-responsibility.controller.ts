import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  ResponsibilityTransferBodyDto,
  ResponsibilityTransferParamDto,
  ResponsibilityTransferResponseDto,
} from './application-responsibility.dto';
import {
  RESPONSIBILITY_ERROR_EXAMPLES as EXAMPLES,
  toResponsibilityApiException,
} from './application-responsibility.http-errors';
import { ApplicationResponsibilityService } from './application-responsibility.service';

/**
 * The IT Admin who answers for an application is the one who declared it; there is no field to choose another. It changes hands here only
 * (`QĐ-111g`, `QĐ-118f`): only the Super Admin names who is responsible; an IT Admin is refused whoever they are.
 */
@ApiTags('applications')
@Controller({ path: 'applications', version: '1' })
export class ApplicationResponsibilityController {
  constructor(private readonly responsibility: ApplicationResponsibilityService) {}

  @Post(':id/responsibility-transfer')
  @RequireRoles('IT_ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'applicationResponsibilityTransfer',
    summary: 'Hand an application to another IT Admin',
  })
  @ApiSuccessResponse(ResponsibilityTransferResponseDto, {
    message: 'APPLICATION.RESPONSIBILITY_TRANSFERRED',
    description:
      'The application now has the IT Admin named as the one responsible; changed is false when it already had them and nothing was written. The audit trail names who handed it to whom.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only the Super Admin changes who is responsible for an application: an IT Admin, even the one responsible, is refused (APPLICATION.RESPONSIBILITY_NOT_YOURS).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.RESPONSIBILITY_NOT_YOURS],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The application does not exist (APPLICATION.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), or the person named is not an IT Admin who works now (APPLICATION.RESPONSIBLE_NOT_IT_ADMIN): nothing changes.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.RESPONSIBLE_NOT_IT_ADMIN],
    },
  )
  async transfer(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ResponsibilityTransferParamDto,
    @Body() body: ResponsibilityTransferBodyDto,
  ) {
    try {
      return await this.responsibility.transfer(actor, params.id, body.toItAdminEmployeeId);
    } catch (error) {
      throw toResponsibilityApiException(error);
    }
  }
}
