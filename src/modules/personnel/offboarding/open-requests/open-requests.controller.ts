import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../../infrastructure/security/decorators/access.decorators';
import { OffboardingIdParamDto, OffboardingPageQueryDto } from '../offboarding.dto';
import { OFFBOARDING_ERROR_EXAMPLES, toOffboardingApiException } from '../offboarding.http-errors';
import { OpenGrantTaskPageResponseDto, OpenRequestPageResponseDto } from './open-requests.dto';
import { OpenRequestsService } from './open-requests.service';

const COMMON = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only an IT Admin reads what is still open for a person who leaves.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  {
    status: HttpStatus.NOT_FOUND,
    description: 'The offboarding case does not exist (OFFBOARDING_CASE.NOT_FOUND).',
    examples: [OFFBOARDING_ERROR_EXAMPLES.NOT_FOUND],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id or a page parameter is not valid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;

/**
 * What is still open for a person whose departure is recorded: the requests they are the beneficiary of and the grants that are not
 * finished (`US-03-04` AC-24). Nothing here changes a request or a task. IT Admin only.
 */
@ApiTags('offboarding-cases')
@Controller({ path: 'offboarding-cases', version: '1' })
@RequireRoles('IT_ADMIN')
export class OpenRequestsController {
  constructor(private readonly open: OpenRequestsService) {}

  @Get(':id/open-requests')
  @ApiOperation({
    operationId: 'offboardingCaseOpenRequestList',
    summary: 'List the requests still open for the person who leaves',
  })
  @ApiSuccessResponse(OpenRequestPageResponseDto, {
    message: 'OFFBOARDING_CASE.OPEN_REQUESTS_LISTED',
    description:
      'A page of the requests the person is the beneficiary of that are not over, oldest first: the plan, where each stands, who sent it, whether it is for a group of people and whether the IT Admin may close it now. A request that waits for the IT Admin to close the task of a withdrawal is not among them. Nothing is closed by itself.',
  })
  @ApiErrorResponses(...COMMON)
  async requests(@Param() params: OffboardingIdParamDto, @Query() query: OffboardingPageQueryDto) {
    try {
      return await this.open.requestsOf(params.id, query);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Get(':id/open-grant-tasks')
  @ApiOperation({
    operationId: 'offboardingCaseOpenGrantTaskList',
    summary: 'List the grants still open for the person who leaves',
  })
  @ApiSuccessResponse(OpenGrantTaskPageResponseDto, {
    message: 'OFFBOARDING_CASE.OPEN_GRANT_TASKS_LISTED',
    description:
      'A page of the grant tasks of the person that are not finished (queued, waiting for a retry, being worked or failed), oldest first, with the request each answers for and the plan. Nothing is cancelled by itself.',
  })
  @ApiErrorResponses(...COMMON)
  async grantTasks(@Param() params: OffboardingIdParamDto, @Query() query: OffboardingPageQueryDto) {
    try {
      return await this.open.grantTasksOf(params.id, query);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }
}
