import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
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
import { DeviceReturnTaskListQueryDto, DeviceReturnTaskPageResponseDto } from './device-return-task.dto';
import { toDeviceReturnTaskApiException } from './device-return-task.http-errors';
import { DeviceReturnTaskQueryService } from './device-return-task-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/** Lists offboarding device return tasks for acting IT Admins and read-only Super Admin oversight. */
@ApiTags('device-return-tasks')
@Controller({ path: 'device-return-tasks', version: '1' })
@RequireRoles('IT_ADMIN', 'SUPER_ADMIN')
export class DeviceReturnTaskController {
  constructor(private readonly queries: DeviceReturnTaskQueryService) {}

  @Get()
  @ApiOperation({
    operationId: 'deviceReturnTaskList',
    summary: 'List offboarding device return tasks',
  })
  @ApiSuccessResponse(DeviceReturnTaskPageResponseDto, {
    message: 'DEVICE_RETURN_TASK.LISTED',
    description:
      'Returns offboarding device return tasks ordered by due date and id, computing current acting IT Admins per task department.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin or Super Admin may list device return tasks.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query parameters are invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: DeviceReturnTaskListQueryDto) {
    try {
      return await this.queries.list(actor, query);
    } catch (error) {
      throw toDeviceReturnTaskApiException(error);
    }
  }
}
