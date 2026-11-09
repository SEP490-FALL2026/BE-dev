import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AcknowledgementBodyDto, AcknowledgementResponseDto, RegistrationIdParamDto } from './acknowledgement.dto';
import {
  ACKNOWLEDGEMENT_ERROR_EXAMPLES as EXAMPLES,
  toAcknowledgementApiException,
} from './acknowledgement.http-errors';
import { AcknowledgementService } from './acknowledgement.service';

/** The holder's own acknowledgement of the notice, for the machine registered to them. */
@ApiTags('my-devices')
@Controller({ path: 'me/device-registrations', version: '1' })
export class AcknowledgementController {
  constructor(private readonly acknowledgements: AcknowledgementService) {}

  @Post(':id/acknowledgements')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'myDeviceAcknowledgementCreate', summary: 'Acknowledge the notice for my machine' })
  @ApiSuccessResponse(AcknowledgementResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_ACKNOWLEDGEMENT.RECORDED',
    description: 'The acknowledgement of the version in force; collection of the machine begins.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The registration does not exist or is not the signed-in holder’s (DEVICE_REGISTRATION.NOT_FOUND).',
      examples: [EXAMPLES.REGISTRATION_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The registration has ended (DEVICE_REGISTRATION.ENDED), its signed notice is not kept yet (DEVICE_REGISTRATION.SIGNATURE_RECORD_MISSING), the version is not the one in force (DEVICE_ACKNOWLEDGEMENT.NOTICE_NOT_CURRENT) or it is acknowledged already (DEVICE_ACKNOWLEDGEMENT.ALREADY_ACKNOWLEDGED).',
      examples: [
        EXAMPLES.REGISTRATION_ENDED,
        EXAMPLES.SIGNATURE_RECORD_MISSING,
        EXAMPLES.NOTICE_NOT_CURRENT,
        EXAMPLES.ALREADY_ACKNOWLEDGED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async acknowledge(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RegistrationIdParamDto,
    @Body() body: AcknowledgementBodyDto,
  ) {
    try {
      const result = await this.acknowledgements.acknowledge(actor, params.id, body);

      return {
        id: result.id,
        registrationId: result.registrationId,
        noticeVersionNumber: result.noticeVersionNumber,
        acknowledgedAt: result.acknowledgedAt.toISOString(),
      };
    } catch (error) {
      throw toAcknowledgementApiException(error);
    }
  }
}
