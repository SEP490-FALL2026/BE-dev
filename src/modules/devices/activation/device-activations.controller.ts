import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import { ActivationQueryService } from './activation-query.service';
import {
  ActivationIdParamDto,
  DeactivateDeviceActivationBodyDto,
  DeviceActivationListQueryDto,
  DeviceActivationPageResponseDto,
  DeviceActivationResponseDto,
  MoveDeviceActivationBodyDto,
  OpenedDeviceActivationResponseDto,
} from './activation.dto';
import { ACTIVATION_ERROR_EXAMPLES as EXAMPLES, toActivationApiException } from './activation.http-errors';
import { toDeviceActivationDto, toOpenedDeviceActivationDto } from './activation.mapper';
import { DeviceActivationCommandService } from './activation.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

const DEACTIVATE_ERRORS = [
  ...AUTH_ERRORS,
  {
    status: HttpStatus.FORBIDDEN,
    description:
      'Only an acting IT Admin covering the holder or return-task department may deactivate software on an assigned or awaiting-return machine (DEVICE.NOT_IN_CHARGE).',
    examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE],
  },
  {
    status: HttpStatus.NOT_FOUND,
    description: 'The device activation does not exist (DEVICE_ACTIVATION.NOT_FOUND).',
    examples: [EXAMPLES.ACTIVATION_NOT_FOUND],
  },
  {
    status: HttpStatus.CONFLICT,
    description:
      'The holder has not started working in a department yet (EMPLOYEE.NOT_STARTED) or the device activation is already closed (DEVICE_ACTIVATION.ALREADY_CLOSED).',
    examples: [EXAMPLES.EMPLOYEE_NOT_STARTED, EXAMPLES.ALREADY_CLOSED],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The request is invalid or license release decisions were supplied for a bundled activation (VALIDATION_ERROR, DEVICE_ACTIVATION.RELEASE_NOT_APPLICABLE).',
    examples: [VALIDATION_EXAMPLE, EXAMPLES.RELEASE_NOT_APPLICABLE],
  },
] as const;

const MOVE_ERRORS = [
  ...AUTH_ERRORS,
  {
    status: HttpStatus.FORBIDDEN,
    description:
      'Only an acting IT Admin covering both source and target assigned/awaiting-return departments may move an activation (DEVICE.NOT_IN_CHARGE).',
    examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE],
  },
  {
    status: HttpStatus.NOT_FOUND,
    description: 'The activation or target machine does not exist (DEVICE_ACTIVATION.NOT_FOUND, DEVICE.NOT_FOUND).',
    examples: [EXAMPLES.ACTIVATION_NOT_FOUND, EXAMPLES.DEVICE_NOT_FOUND],
  },
  {
    status: HttpStatus.CONFLICT,
    description:
      'The holder has not started working in a department yet (EMPLOYEE.NOT_STARTED), or the target machine or key state refuses moving the activation (DEVICE.VOIDED, DEVICE.ALREADY_RETIRED, DEVICE.AWAITING_RETURN, DEVICE.NOT_USABLE, DEVICE_ACTIVATION.ALREADY_CLOSED, DEVICE_ACTIVATION.KEY_WITHDRAWN, DEVICE_ACTIVATION.PURCHASE_NOT_ACTIVE, DEVICE_ACTIVATION.LOT_FULL, DEVICE_ACTIVATION.ALREADY_ON_DEVICE).',
    examples: [
      EXAMPLES.EMPLOYEE_NOT_STARTED,
      EXAMPLES.VOIDED,
      EXAMPLES.ALREADY_RETIRED,
      EXAMPLES.AWAITING_RETURN,
      EXAMPLES.NOT_USABLE,
      EXAMPLES.ALREADY_CLOSED,
      EXAMPLES.KEY_WITHDRAWN,
      EXAMPLES.PURCHASE_NOT_ACTIVE,
      EXAMPLES.LOT_FULL,
      EXAMPLES.ALREADY_ON_DEVICE,
    ],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The request is invalid, the activation is bundled, or source and target match (VALIDATION_ERROR, DEVICE_ACTIVATION.NOT_MOVABLE, DEVICE.SAME_DEVICE).',
    examples: [VALIDATION_EXAMPLE, EXAMPLES.NOT_MOVABLE, EXAMPLES.SAME_DEVICE],
  },
] as const;

/** Lists, deactivates, and moves machine software activations by activation ID. */
@ApiTags('devices')
@Controller({ path: 'device-activations', version: '1' })
@RequireRoles('IT_ADMIN')
export class DeviceActivationsController {
  constructor(
    private readonly commands: DeviceActivationCommandService,
    private readonly queries: ActivationQueryService,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'deviceActivationList',
    summary: 'List machine software activations across the register',
  })
  @ApiSuccessResponse(DeviceActivationPageResponseDto, {
    status: HttpStatus.OK,
    message: 'DEVICE_ACTIVATION.LISTED',
    description: 'Lists device software activations with custody, condition, key status, and replacement flags.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin lists the software activations of the machines.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query parameters are invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Query() query: DeviceActivationListQueryDto) {
    try {
      return await this.queries.list(query);
    } catch (error) {
      throw toActivationApiException(error);
    }
  }

  @Post(':id/deactivation')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'deviceActivationDeactivate',
    summary: 'Deactivate an open software activation on a machine',
  })
  @ApiSuccessResponse(DeviceActivationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_ACTIVATION.CLOSED',
    description:
      'Closes an open software activation and returns its keyed license to the lot unless LOST_WITH_DEVICE is chosen.',
  })
  @ApiErrorResponses(...DEACTIVATE_ERRORS)
  async deactivate(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ActivationIdParamDto,
    @Body() body: DeactivateDeviceActivationBodyDto,
  ) {
    try {
      const closed = await this.commands.deactivate(actor, params.id, body);

      return toDeviceActivationDto(closed);
    } catch (error) {
      throw toActivationApiException(error);
    }
  }

  @Post(':id/moves')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'deviceActivationMove',
    summary: 'Move a keyed software activation to another machine',
  })
  @ApiSuccessResponse(OpenedDeviceActivationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_ACTIVATION.MOVED',
    description:
      'Closes the source activation and opens a replacement activation for the same key on the target machine in one transaction.',
  })
  @ApiErrorResponses(...MOVE_ERRORS)
  async move(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ActivationIdParamDto,
    @Body() body: MoveDeviceActivationBodyDto,
  ) {
    try {
      const moved = await this.commands.move(actor, params.id, body);

      return toOpenedDeviceActivationDto(moved);
    } catch (error) {
      throw toActivationApiException(error);
    }
  }
}
