import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ActivationQueryService } from './activation-query.service';
import { MeDeviceSoftwarePageResponseDto, MeDeviceSoftwareQueryDto } from './activation.dto';

/** Lists open machine-bound software activations on company machines currently held by the signed-in employee. */
@ApiTags('me')
@Controller({ path: 'me/device-software', version: '1' })
export class MeDeviceSoftwareController {
  constructor(private readonly queries: ActivationQueryService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'meDeviceSoftwareList',
    summary: 'List open software activations on company machines I currently hold',
  })
  @ApiSuccessResponse(MeDeviceSoftwarePageResponseDto, {
    status: HttpStatus.OK,
    message: 'ME.DEVICE_SOFTWARE_LISTED',
    description:
      'Lists only open software activations on company machines currently held by the signed-in employee. Machine-bound software cannot be submitted for self-service return requests, and reporting an issue directly on a machine-bound software item is not yet supported; contact IT support through normal channels instead.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query parameters are invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: MeDeviceSoftwareQueryDto) {
    try {
      return await this.queries.meDeviceSoftware(actor.employeeId, query);
    } catch (error) {
      throw toUnavailableApiException(error) ?? error;
    }
  }
}
