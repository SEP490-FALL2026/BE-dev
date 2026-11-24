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
 * The correction of what a person entered wrong on a machine: its name, system, serial number and kind.
 * Any IT Admin may update a machine in stock; for an assigned machine or one awaiting return, only an acting IT Admin
 * of the holder department is allowed. The asset code never changes.
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
      description:
        'Only an IT Admin corrects a machine; an assigned machine or one awaiting return requires an acting IT Admin of the holder department, and never the person who is leaving with it (DEVICE.NOT_IN_CHARGE).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The machine is not in the register (DEVICE.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The machine changed since it was read (DEVICE.STALE, details.currentUpdatedAt), it was voided (DEVICE.VOIDED) or taken out of use (DEVICE.ALREADY_RETIRED), another machine has the serial number (DEVICE.SERIAL_TAKEN), or the holder has not started working in a department yet (EMPLOYEE.NOT_STARTED). Nothing is written.',
      examples: [
        EXAMPLES.STALE,
        EXAMPLES.VOIDED,
        EXAMPLES.ALREADY_RETIRED,
        EXAMPLES.SERIAL_TAKEN,
        EXAMPLES.EMPLOYEE_NOT_STARTED,
      ],
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
