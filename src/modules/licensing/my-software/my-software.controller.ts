import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { MySoftwarePageResponseDto, MySoftwareQueryDto, type MySoftwarePageWire } from './my-software.dto';
import { MySoftwareService } from './my-software.service';

/**
 * "My software": the rights the signed-in Employee holds, for the web overview and the mobile screen alike (one operation, no
 * separate one for mobile). Read only, and only ever about the caller.
 */
@ApiTags('me')
@Controller({ path: 'me/software-rights', version: '1' })
export class MySoftwareController {
  constructor(private readonly software: MySoftwareService) {}

  @Get()
  @RequireRoles('EMPLOYEE')
  @ApiOperation({ operationId: 'meSoftwareRightList', summary: 'List the software rights I hold' })
  @ApiSuccessResponse(MySoftwarePageResponseDto, {
    message: 'ME.SOFTWARE_RIGHTS_LISTED',
    description:
      'One page of the personal software rights of the signed-in person and nobody else: by default those held on the business day of the organization or starting later, oldest start first; with view ended, those no longer held, latest end first; then by assignment id. Each names the application and plan, the kind of provisioning (K1 to K5), its status on that day (asOf), the day a time-limited right is expected to end and whether that is within seven days, and the day it stops being held when that is set. A right that a renewal continues names the record that takes over. A grant that failed or was cancelled never held anything and is not listed. No price, cost, Cost Center, account identifier, license key or other person is answered: a K4 right shows that the software is granted, never its key. A start that is only the day of recording has a label and no grant date.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The caller does not hold the Employee role; other roles do not read this list.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The view, the page or its size is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Query() query: MySoftwareQueryDto,
  ): Promise<MySoftwarePageWire> {
    try {
      const { asOf, view, page } = await this.software.list(actor, query);

      return { asOf, view, items: page.items, pagination: page.pagination };
    } catch (error) {
      throw toUnavailableApiException(error) ?? error;
    }
  }
}
