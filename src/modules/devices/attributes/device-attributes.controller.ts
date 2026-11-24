import { Body, Controller, HttpStatus, Param, Patch } from '@nestjs/common';
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
  DeviceAttributesBodyDto,
  DeviceAttributesParamDto,
  DeviceAttributesResponseDto,
} from './device-attributes.dto';
import {
  DEVICE_ATTRIBUTES_ERROR_EXAMPLES as EXAMPLES,
  toDeviceAttributesApiException,
} from './device-attributes.http-errors';
import { DeviceAttributesService } from './device-attributes.service';

/**
 * The correction of what a person entered wrong on a machine (`MAY-13`): its name, system, serial number and kind. Any IT Admin may do it: it
 * touches no holding, no key and no job. The asset code never changes.
 */
@ApiTags('devices')
@Controller({ path: 'devices', version: '1' })
export class DeviceAttributesController {
  constructor(private readonly attributes: DeviceAttributesService) {}

  @Patch(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'deviceUpdate',
    summary: 'Correct the name, system, serial number or kind of a machine',
  })
  @ApiSuccessResponse(DeviceAttributesResponseDto, {
    message: 'DEVICE.UPDATED',
    description:
      'The machine as it is after the correction, with its new updatedAt. A correction that changes nothing is answered the same and not audited. The asset code never changes, whatever the kind becomes. One event of the audit trail (DEVICE.UPDATED) says what each field was and what it became.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin corrects a machine.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The machine is not in the register (DEVICE.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The machine changed since it was read (DEVICE.STALE, details.currentUpdatedAt), it was taken out of use or voided (DEVICE.NOT_EDITABLE, details.reason) or another machine has the serial number (DEVICE.SERIAL_NUMBER_TAKEN). Nothing is written.',
      examples: [EXAMPLES.STALE, EXAMPLES.NOT_EDITABLE, EXAMPLES.SERIAL_NUMBER_TAKEN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR: expectedUpdatedAt is required and a name, system or serial number is 1 to its limit of characters) or names no field to change (DEVICE.UPDATE_EMPTY).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.UPDATE_EMPTY],
    },
  )
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceAttributesParamDto,
    @Body() body: DeviceAttributesBodyDto,
  ) {
    try {
      const { expectedUpdatedAt, ...fields } = body;
      const device = await this.attributes.change(actor, params.id, {
        ...fields,
        expectedUpdatedAt: new Date(expectedUpdatedAt),
      });

      return { ...device, updatedAt: device.updatedAt.toISOString() };
    } catch (error) {
      throw toDeviceAttributesApiException(error);
    }
  }
}
