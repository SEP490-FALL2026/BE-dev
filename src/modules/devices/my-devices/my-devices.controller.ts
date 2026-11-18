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
import { MyDeviceListQueryDto, MyDevicePageResponseDto } from './my-devices.dto';
import { MyDevicesService } from './my-devices.service';

/** The machines registered to the person signed in: any account sees only its own. */
@ApiTags('my-devices')
@Controller({ path: 'me/devices', version: '1' })
export class MyDevicesController {
  constructor(private readonly devices: MyDevicesService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'myDeviceList', summary: 'List the company machines registered to me' })
  @ApiSuccessResponse(MyDevicePageResponseDto, {
    message: 'MY_DEVICE.LISTED',
    description:
      'The registrations of the signed-in person, open first, each with whether they can acknowledge the notice now and, when they cannot, why.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: MyDeviceListQueryDto) {
    try {
      return await this.devices.list(actor.employeeId, query);
    } catch (error) {
      throw toUnavailableApiException(error) ?? error;
    }
  }
}
