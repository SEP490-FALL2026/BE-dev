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
import { DeviceReturnTaskQueryService } from '../return-task/device-return-task-query.service';
import {
  DeviceReturnTaskCompleteBodyDto,
  DeviceReturnTaskIdParamDto,
  DeviceReturnTaskResponseDto,
} from '../return-task/device-return-task.dto';
import {
  DEVICE_RETURN_TASK_ERROR_EXAMPLES as TASK_EXAMPLES,
  mapDeviceReturnTaskError,
} from '../return-task/device-return-task.http-errors';
import { LIFECYCLE_ERROR_EXAMPLES as LIFECYCLE_EXAMPLES, toLifecycleApiException } from './lifecycle.http-errors';
import { ReturnTaskCompletionService } from './return-task-completion.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

const COMPLETE_ERRORS = [
  ...AUTH_ERRORS,
  {
    status: HttpStatus.FORBIDDEN,
    description:
      'Only an acting IT Admin covering the task department (excluding the departing employee) may complete the task (DEVICE_RETURN_TASK.NOT_IN_CHARGE).',
    examples: [FORBIDDEN_EXAMPLE, LIFECYCLE_EXAMPLES.RETURN_TASK_NOT_IN_CHARGE],
  },
  {
    status: HttpStatus.NOT_FOUND,
    description:
      'The return task or referenced machine does not exist (DEVICE_RETURN_TASK.NOT_FOUND, DEVICE.NOT_FOUND).',
    examples: [TASK_EXAMPLES.NOT_FOUND, LIFECYCLE_EXAMPLES.DEVICE_NOT_FOUND],
  },
  {
    status: HttpStatus.CONFLICT,
    description:
      'The task is already closed, the employee has not started working in a department yet, or the machine state prevents completion (DEVICE_RETURN_TASK.ALREADY_CLOSED, EMPLOYEE.NOT_STARTED, DEVICE.VOIDED, DEVICE.ALREADY_RETIRED).',
    examples: [
      TASK_EXAMPLES.ALREADY_CLOSED,
      LIFECYCLE_EXAMPLES.EMPLOYEE_NOT_STARTED,
      LIFECYCLE_EXAMPLES.VOIDED,
      LIFECYCLE_EXAMPLES.ALREADY_RETIRED,
    ],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The completion fields are invalid or activation decisions are invalid (VALIDATION_ERROR, DEVICE_RETURN_TASK.OUTCOME_FIELDS_INVALID, DEVICE_RETURN_TASK.SOFTWARE_REMOVAL_NOTE_REQUIRED, DEVICE_ACTIVATION.NOT_ON_DEVICE, DEVICE_ACTIVATION.RELEASE_NOT_APPLICABLE).',
    examples: [
      VALIDATION_EXAMPLE,
      TASK_EXAMPLES.OUTCOME_FIELDS_INVALID,
      TASK_EXAMPLES.SOFTWARE_REMOVAL_NOTE_REQUIRED,
      LIFECYCLE_EXAMPLES.ACTIVATION_NOT_ON_DEVICE,
      LIFECYCLE_EXAMPLES.ACTIVATION_RELEASE_NOT_APPLICABLE,
    ],
  },
] as const;

/** Completes open offboarding device return tasks (received back to stock or retired as lost). */
@ApiTags('device-return-tasks')
@Controller({ path: 'device-return-tasks', version: '1' })
@RequireRoles('IT_ADMIN')
export class ReturnTaskCompletionController {
  constructor(
    private readonly completions: ReturnTaskCompletionService,
    private readonly queries: DeviceReturnTaskQueryService,
  ) {}

  @Post(':id/completion')
  @ApiOperation({
    operationId: 'deviceReturnTaskComplete',
    summary: 'Complete an offboarding device return task',
  })
  @ApiSuccessResponse(DeviceReturnTaskResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_RETURN_TASK.COMPLETED',
    description:
      'Completes an open return task either as received (returning the machine to stock) or not recovered (retiring the machine as lost).',
  })
  @ApiErrorResponses(...COMPLETE_ERRORS)
  async complete(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceReturnTaskIdParamDto,
    @Body() body: DeviceReturnTaskCompleteBodyDto,
  ) {
    try {
      await this.completions.complete(actor, params.id, body);

      return { task: await this.queries.get(params.id) };
    } catch (error) {
      throw mapDeviceReturnTaskError(error) ?? toLifecycleApiException(error);
    }
  }
}
