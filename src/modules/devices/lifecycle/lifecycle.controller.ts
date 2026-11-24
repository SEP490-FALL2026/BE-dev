import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
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
import { DeviceDetailResponseDto, DeviceIdParamDto } from '../registry/registry.dto';
import { RegistryQueryService } from '../registry/registry-query.service';
import { ConditionService } from './condition.service';
import { DeviceReceiptService } from './device-receipt.service';
import { HolderChangeService } from './holder-change.service';
import { ConditionChangeBodyDto, DeviceReturnBodyDto, HolderChangeBodyDto, RetirementBodyDto } from './lifecycle.dto';
import { LIFECYCLE_ERROR_EXAMPLES as EXAMPLES, toLifecycleApiException } from './lifecycle.http-errors';
import { RetirementService } from './retirement.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const DEVICE_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The machine is not in the register (DEVICE.NOT_FOUND).',
  examples: [EXAMPLES.DEVICE_NOT_FOUND],
} as const;

/** Lifecycle transitions of a registered company machine: handover, holder change, return to stock, and condition/retirement flows. */
@ApiTags('devices')
@Controller({ path: 'devices', version: '1' })
@RequireRoles('IT_ADMIN')
export class LifecycleController {
  constructor(
    private readonly holderChanges: HolderChangeService,
    private readonly receipts: DeviceReceiptService,
    private readonly conditions: ConditionService,
    private readonly retirements: RetirementService,
    private readonly queries: RegistryQueryService,
  ) {}

  @Post(':id/holder-changes')
  @ApiOperation({ operationId: 'deviceHolderChange', summary: 'Give a company machine to another holder' })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE.HOLDER_CHANGED',
    description:
      'The open registration ends with software removal confirmation and a new registration opens for the new holder; an in-stock usable machine is assigned without removal confirmation.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an acting IT Admin covering the holder and recipient departments may assign or transfer the machine (DEVICE.NOT_IN_CHARGE).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE],
    },
    DEVICE_NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The machine is voided (DEVICE.VOIDED), retired (DEVICE.ALREADY_RETIRED), awaiting return (DEVICE.AWAITING_RETURN), not usable (DEVICE.NOT_USABLE), held by the same person (DEVICE.HOLDER_UNCHANGED), the holder has left or is handing over (DEVICE.HOLDER_NOT_WORKING), or an overlapping registration exists (DEVICE.REGISTRATION_OVERLAP).',
      examples: [
        EXAMPLES.VOIDED,
        EXAMPLES.ALREADY_RETIRED,
        EXAMPLES.AWAITING_RETURN,
        EXAMPLES.NOT_USABLE,
        EXAMPLES.HOLDER_UNCHANGED,
        EXAMPLES.HOLDER_NOT_WORKING,
        EXAMPLES.REGISTRATION_OVERLAP,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), software removal confirmation is required (DEVICE.SOFTWARE_REMOVAL_REQUIRED), a removal note is required (DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED), or the holder does not exist (DEVICE.HOLDER_NOT_FOUND).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.SOFTWARE_REMOVAL_REQUIRED,
        EXAMPLES.SOFTWARE_REMOVAL_NOTE_REQUIRED,
        EXAMPLES.HOLDER_NOT_FOUND,
      ],
    },
  )
  async changeHolder(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Body() body: HolderChangeBodyDto,
  ) {
    try {
      await this.holderChanges.changeHolder(actor, params.id, body);

      return await this.queries.get(params.id);
    } catch (error) {
      throw toLifecycleApiException(error);
    }
  }

  @Post(':id/returns')
  @ApiOperation({ operationId: 'deviceReturn', summary: 'Return a company machine to stock' })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE.RETURNED',
    description: 'Ends the active holding as returned, updates the machine condition, and places the machine in stock.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an acting IT Admin of the holder or return-task department may return the machine to stock (DEVICE.NOT_IN_CHARGE, DEVICE_RETURN_TASK.NOT_IN_CHARGE).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE, EXAMPLES.RETURN_TASK_NOT_IN_CHARGE],
    },
    DEVICE_NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The machine is voided (DEVICE.VOIDED), retired (DEVICE.ALREADY_RETIRED), or already in stock (DEVICE.NOT_HELD).',
      examples: [EXAMPLES.VOIDED, EXAMPLES.ALREADY_RETIRED, EXAMPLES.NOT_HELD],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or a note explaining non-removable software is required (DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.SOFTWARE_REMOVAL_NOTE_REQUIRED],
    },
  )
  async returnToStock(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Body() body: DeviceReturnBodyDto,
  ) {
    try {
      await this.receipts.returnToStock(actor, params.id, body);

      return await this.queries.get(params.id);
    } catch (error) {
      throw toLifecycleApiException(error);
    }
  }

  @Post(':id/condition-changes')
  @ApiOperation({ operationId: 'deviceConditionChange', summary: 'Update the physical condition of a machine' })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE.CONDITION_CHANGED',
    description: 'Updates the machine condition without changing its holder or open activations.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an acting IT Admin of the holder or return-task department may change the condition of an assigned or awaiting-return machine (DEVICE.NOT_IN_CHARGE).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE],
    },
    DEVICE_NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The machine is voided (DEVICE.VOIDED), retired (DEVICE.ALREADY_RETIRED), or already has that condition (DEVICE.CONDITION_UNCHANGED).',
      examples: [EXAMPLES.VOIDED, EXAMPLES.ALREADY_RETIRED, EXAMPLES.CONDITION_UNCHANGED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async changeCondition(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Body() body: ConditionChangeBodyDto,
  ) {
    try {
      await this.conditions.changeCondition(actor, params.id, body);

      return await this.queries.get(params.id);
    } catch (error) {
      throw toLifecycleApiException(error);
    }
  }

  @Post(':id/retirements')
  @ApiOperation({ operationId: 'deviceRetire', summary: 'Take a company machine out of use' })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE.RETIRED',
    description: 'The open registration ends and the machine stays in the register as retired, with the reason.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an acting IT Admin of the holder department may retire a held machine; any IT Admin may retire an in-stock machine (DEVICE.NOT_IN_CHARGE).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE],
    },
    DEVICE_NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The machine is voided (DEVICE.VOIDED) or already retired (DEVICE.ALREADY_RETIRED).',
      examples: [EXAMPLES.VOIDED, EXAMPLES.ALREADY_RETIRED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async retire(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Body() body: RetirementBodyDto,
  ) {
    try {
      await this.retirements.retire(actor, params.id, body.reason);

      return await this.queries.get(params.id);
    } catch (error) {
      throw toLifecycleApiException(error);
    }
  }
}
