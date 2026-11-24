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
import {
  ConditionChangeBodyDto,
  DeviceReplacementBodyDto,
  DeviceReplacementResponseDto,
  DeviceReturnBodyDto,
  DeviceVoidBodyDto,
  HolderChangeBodyDto,
  RetirementBodyDto,
} from './lifecycle.dto';
import { LIFECYCLE_ERROR_EXAMPLES as EXAMPLES, toLifecycleApiException } from './lifecycle.http-errors';
import { ReplacementService } from './replacement.service';
import { RetirementService } from './retirement.service';
import { VoidService } from './void.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const DEVICE_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The machine is not in the register (DEVICE.NOT_FOUND).',
  examples: [EXAMPLES.DEVICE_NOT_FOUND],
} as const;

const REPLACE_ERRORS = [
  ...AUTH_ERRORS,
  {
    status: HttpStatus.FORBIDDEN,
    description:
      'Only an acting IT Admin covering the holder department may replace the machine (DEVICE.NOT_IN_CHARGE).',
    examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE],
  },
  DEVICE_NOT_FOUND,
  {
    status: HttpStatus.CONFLICT,
    description:
      'The source or replacement machine, holder, or keyed license state refuses replacement (EMPLOYEE.NOT_STARTED, DEVICE.VOIDED, DEVICE.ALREADY_RETIRED, DEVICE.AWAITING_RETURN, DEVICE.NOT_HELD, DEVICE.REPLACEMENT_NOT_IN_STOCK, DEVICE.NOT_USABLE, DEVICE.HOLDER_NOT_WORKING, DEVICE.REGISTRATION_OVERLAP, DEVICE_ACTIVATION.ALREADY_ON_DEVICE, DEVICE_ACTIVATION.KEY_WITHDRAWN, DEVICE_ACTIVATION.LOT_FULL, DEVICE_ACTIVATION.PURCHASE_NOT_ACTIVE).',
    examples: [
      EXAMPLES.EMPLOYEE_NOT_STARTED,
      EXAMPLES.VOIDED,
      EXAMPLES.ALREADY_RETIRED,
      EXAMPLES.AWAITING_RETURN,
      EXAMPLES.NOT_HELD,
      EXAMPLES.REPLACEMENT_NOT_IN_STOCK,
      EXAMPLES.NOT_USABLE,
      EXAMPLES.HOLDER_NOT_WORKING,
      EXAMPLES.REGISTRATION_OVERLAP,
      EXAMPLES.ACTIVATION_ALREADY_ON_DEVICE,
      EXAMPLES.ACTIVATION_KEY_WITHDRAWN,
      EXAMPLES.ACTIVATION_LOT_FULL,
      EXAMPLES.ACTIVATION_PURCHASE_NOT_ACTIVE,
    ],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The request is invalid, source and replacement match, removal note is missing, or a listed activation cannot move (VALIDATION_ERROR, DEVICE.SAME_DEVICE, DEVICE.HOLDER_NOT_FOUND, DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED, DEVICE_ACTIVATION.NOT_ON_DEVICE, DEVICE_ACTIVATION.NOT_MOVABLE).',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.SAME_DEVICE,
      EXAMPLES.HOLDER_NOT_FOUND,
      EXAMPLES.SOFTWARE_REMOVAL_NOTE_REQUIRED,
      EXAMPLES.ACTIVATION_NOT_ON_DEVICE,
      EXAMPLES.ACTIVATION_NOT_MOVABLE,
    ],
  },
] as const;

/** Lifecycle transitions of a registered company machine: handover, replacement, return, condition, retirement, and void. */
@ApiTags('devices')
@Controller({ path: 'devices', version: '1' })
@RequireRoles('IT_ADMIN')
export class LifecycleController {
  constructor(
    private readonly holderChanges: HolderChangeService,
    private readonly receipts: DeviceReceiptService,
    private readonly conditions: ConditionService,
    private readonly retirements: RetirementService,
    private readonly replacements: ReplacementService,
    private readonly voids: VoidService,
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
        'The holder has not started working in a department yet (EMPLOYEE.NOT_STARTED), the machine is voided (DEVICE.VOIDED), retired (DEVICE.ALREADY_RETIRED), awaiting return (DEVICE.AWAITING_RETURN), not usable (DEVICE.NOT_USABLE), held by the same person (DEVICE.HOLDER_UNCHANGED), the holder has left or is handing over (DEVICE.HOLDER_NOT_WORKING), or an overlapping registration exists (DEVICE.REGISTRATION_OVERLAP).',
      examples: [
        EXAMPLES.EMPLOYEE_NOT_STARTED,
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

  @Post(':id/replacements')
  @ApiOperation({
    operationId: 'deviceReplace',
    summary: 'Replace an assigned company machine with an in-stock usable machine',
  })
  @ApiSuccessResponse(DeviceReplacementResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE.REPLACED',
    description:
      'Returns the assigned machine to stock, hands over the replacement machine to the same holder, and moves selected keyed activations atomically.',
  })
  @ApiErrorResponses(...REPLACE_ERRORS)
  async replace(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Body() body: DeviceReplacementBodyDto,
  ) {
    try {
      const result = await this.replacements.replace(actor, params.id, body);

      return {
        returnedDeviceId: result.returnedDeviceId,
        replacementDevice: await this.queries.get(result.replacementDeviceId),
        movedActivations: result.movedActivations,
      };
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
        'The employee has not started working in a department yet (EMPLOYEE.NOT_STARTED), or the machine is voided (DEVICE.VOIDED), retired (DEVICE.ALREADY_RETIRED), or already in stock (DEVICE.NOT_HELD).',
      examples: [EXAMPLES.EMPLOYEE_NOT_STARTED, EXAMPLES.VOIDED, EXAMPLES.ALREADY_RETIRED, EXAMPLES.NOT_HELD],
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
        'The employee has not started working in a department yet (EMPLOYEE.NOT_STARTED), or the machine is voided (DEVICE.VOIDED), retired (DEVICE.ALREADY_RETIRED), or already has that condition (DEVICE.CONDITION_UNCHANGED).',
      examples: [
        EXAMPLES.EMPLOYEE_NOT_STARTED,
        EXAMPLES.VOIDED,
        EXAMPLES.ALREADY_RETIRED,
        EXAMPLES.CONDITION_UNCHANGED,
      ],
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
    description:
      'Ends any open registration and closes open software activations, keeping the machine in the register as retired.',
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
      description:
        'The holder has not started working in a department yet (EMPLOYEE.NOT_STARTED), or the machine is voided (DEVICE.VOIDED), already retired (DEVICE.ALREADY_RETIRED), or awaiting return (DEVICE.AWAITING_RETURN).',
      examples: [EXAMPLES.EMPLOYEE_NOT_STARTED, EXAMPLES.VOIDED, EXAMPLES.ALREADY_RETIRED, EXAMPLES.AWAITING_RETURN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid or activation release decisions do not match open keyed activations on the machine (VALIDATION_ERROR, DEVICE_ACTIVATION.NOT_ON_DEVICE, DEVICE_ACTIVATION.RELEASE_NOT_APPLICABLE).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.ACTIVATION_NOT_ON_DEVICE, EXAMPLES.ACTIVATION_RELEASE_NOT_APPLICABLE],
    },
  )
  async retire(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Body() body: RetirementBodyDto,
  ) {
    try {
      await this.retirements.retire(actor, params.id, {
        retirementKind: body.retirementKind,
        reason: body.reason,
        activationDecisions: body.activationDecisions,
      });

      return await this.queries.get(params.id);
    } catch (error) {
      throw toLifecycleApiException(error);
    }
  }

  @Post(':id/voids')
  @ApiOperation({ operationId: 'deviceVoid', summary: 'Void a mistakenly entered company machine record' })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE.VOIDED',
    description: 'Marks an untouched machine record as voided and closes any initial bundled activations.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin may void a machine record.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    DEVICE_NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The machine is already voided (DEVICE.VOIDED), retired (DEVICE.ALREADY_RETIRED), or has custody, signature, credential, or key activation history (DEVICE.VOID_REFUSED).',
      examples: [EXAMPLES.VOIDED, EXAMPLES.ALREADY_RETIRED, EXAMPLES.VOID_REFUSED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async voidDevice(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Body() body: DeviceVoidBodyDto,
  ) {
    try {
      await this.voids.voidDevice(actor, params.id, body.reason);

      return await this.queries.get(params.id);
    } catch (error) {
      throw toLifecycleApiException(error);
    }
  }
}
