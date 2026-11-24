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
import { DeviceIdParamDto } from '../registry/registry.dto';
import { OpenDeviceActivationBodyDto, OpenedDeviceActivationResponseDto } from './activation.dto';
import { ACTIVATION_ERROR_EXAMPLES as EXAMPLES, toActivationApiException } from './activation.http-errors';
import { toOpenedDeviceActivationDto } from './activation.mapper';
import { DeviceActivationCommandService } from './activation.service';

const ACTIVATION_OPEN_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description:
      'Only an acting IT Admin covering the holder or return-task department may activate software on an assigned or awaiting-return machine (DEVICE.NOT_IN_CHARGE).',
    examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE],
  },
  {
    status: HttpStatus.NOT_FOUND,
    description: 'The machine is not in the register (DEVICE.NOT_FOUND).',
    examples: [EXAMPLES.DEVICE_NOT_FOUND],
  },
  {
    status: HttpStatus.CONFLICT,
    description:
      'The machine or license key state refuses the activation (DEVICE.VOIDED, DEVICE.ALREADY_RETIRED, DEVICE.AWAITING_RETURN, DEVICE.NOT_USABLE, DEVICE_ACTIVATION.LOT_FULL, DEVICE_ACTIVATION.KEY_WITHDRAWN, DEVICE_ACTIVATION.PURCHASE_NOT_ACTIVE, DEVICE_ACTIVATION.ALREADY_ON_DEVICE).',
    examples: [
      EXAMPLES.VOIDED,
      EXAMPLES.ALREADY_RETIRED,
      EXAMPLES.AWAITING_RETURN,
      EXAMPLES.NOT_USABLE,
      EXAMPLES.LOT_FULL,
      EXAMPLES.KEY_WITHDRAWN,
      EXAMPLES.PURCHASE_NOT_ACTIVE,
      EXAMPLES.ALREADY_ON_DEVICE,
    ],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The input is invalid or the plan/key pairing is not allowed (VALIDATION_ERROR, DEVICE_ACTIVATION.PLAN_NOT_FOUND, DEVICE_ACTIVATION.PLAN_NOT_DEVICE_BOUND, DEVICE_ACTIVATION.KEY_NOT_ALLOWED, DEVICE_ACTIVATION.KEY_REQUIRED, DEVICE_ACTIVATION.KEY_NOT_FOUND, DEVICE_ACTIVATION.KEY_NOT_OF_PLAN).',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.PLAN_NOT_FOUND,
      EXAMPLES.PLAN_NOT_DEVICE_BOUND,
      EXAMPLES.KEY_NOT_ALLOWED,
      EXAMPLES.KEY_REQUIRED,
      EXAMPLES.KEY_NOT_FOUND,
      EXAMPLES.KEY_NOT_OF_PLAN,
    ],
  },
] as const;

/** Manages machine-bound software activations (`DEVICE_KEY` and `DEVICE_BUNDLED`) on registered company machines. */
@ApiTags('devices')
@Controller({ path: 'devices', version: '1' })
@RequireRoles('IT_ADMIN')
export class DeviceActivationController {
  constructor(private readonly commands: DeviceActivationCommandService) {}

  @Post(':id/activations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'deviceActivationCreate',
    summary: 'Open a software activation on a company machine',
  })
  @ApiSuccessResponse(OpenedDeviceActivationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_ACTIVATION.OPENED',
    description:
      'Records an open bundled or keyed software activation on the machine and reports activation cap metrics when keyed.',
  })
  @ApiErrorResponses(...ACTIVATION_OPEN_ERRORS)
  async create(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Body() body: OpenDeviceActivationBodyDto,
  ) {
    try {
      const opened = await this.commands.open(actor, params.id, body);

      return toOpenedDeviceActivationDto(opened);
    } catch (error) {
      throw toActivationApiException(error);
    }
  }
}
