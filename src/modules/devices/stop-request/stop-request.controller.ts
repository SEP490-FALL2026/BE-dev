import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  StopRequestBodyDto,
  StopRequestIdParamDto,
  StopRequestListQueryDto,
  StopRequestPageResponseDto,
  StopRequestResponseDto,
} from './stop-request.dto';
import { STOP_REQUEST_ERROR_EXAMPLES as EXAMPLES, toStopRequestApiException } from './stop-request.http-errors';
import { toStopRequestWire } from './stop-request.mapper';
import { StopRequestCompletionService } from './stop-request-completion.service';
import { StopRequestQueryService } from './stop-request-query.service';
import { StopRequestService } from './stop-request.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin handles the requests to stop collection.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

/** The holder asks to stop the collection of their machine; the IT Admin reads the requests and completes them (`US-09-04`). */
@ApiTags('device-stop-requests')
@Controller({ version: '1' })
export class StopRequestController {
  constructor(
    private readonly requests: StopRequestService,
    private readonly completions: StopRequestCompletionService,
    private readonly queries: StopRequestQueryService,
  ) {}

  @Post('me/device-registrations/:id/stop-requests')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'myDeviceStopRequestCreate', summary: 'Ask to stop the collection of my machine' })
  @ApiSuccessResponse(StopRequestResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_STOP_REQUEST.CREATED',
    description:
      'The request received: open with its deadline, or kept as invalid (DUPLICATE: another request is open, ALREADY_STOPPED: collection is stopped already) with the time it was handled. Collection goes on until an IT Admin completes an open request.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The registration does not exist or is not the signed-in holder’s (DEVICE_REGISTRATION.NOT_FOUND).',
      examples: [EXAMPLES.REGISTRATION_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The registration has ended (DEVICE_REGISTRATION.ENDED).',
      examples: [EXAMPLES.REGISTRATION_ENDED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async create(
    // The body is `{}` and nothing else: the pipe refuses any field, and there is nothing to read.
    @Body() _body: StopRequestBodyDto,
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: StopRequestIdParamDto,
  ) {
    try {
      const now = new Date();

      return { stopRequest: toStopRequestWire(await this.requests.create(actor, params.id, now), now) };
    } catch (error) {
      throw toStopRequestApiException(error);
    }
  }

  @Get('device-stop-requests')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'deviceStopRequestList', summary: 'List the requests to stop collection' })
  @ApiSuccessResponse(StopRequestPageResponseDto, {
    message: 'DEVICE_STOP_REQUEST.LISTED',
    description:
      'A page of the requests in one state (open when omitted), those due first, each marked overdue while open and past its deadline.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ADMIN_ONLY, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@Query() query: StopRequestListQueryDto) {
    try {
      return await this.queries.list(query);
    } catch (error) {
      throw toStopRequestApiException(error);
    }
  }

  @Post('device-stop-requests/:id/completion')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'deviceStopRequestComplete', summary: 'Stop the collection a holder asked to stop' })
  @ApiSuccessResponse(StopRequestResponseDto, {
    message: 'DEVICE_STOP_REQUEST.COMPLETED',
    description:
      'The request completed: the machine is no longer collected from and its credentials stay until the holder acknowledges again.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an acting IT Admin of the holder department may complete this request (AUTHORIZATION.FORBIDDEN, DEVICE_STOP_REQUEST.NOT_IN_CHARGE).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The request does not exist (DEVICE_STOP_REQUEST.NOT_FOUND).',
      examples: [EXAMPLES.STOP_REQUEST_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The holder has not started working in a department yet (EMPLOYEE.NOT_STARTED), or the request is not open (DEVICE_STOP_REQUEST.NOT_OPEN, details.state): completed already, or closed as invalid, among them because the registration ended.',
      examples: [EXAMPLES.EMPLOYEE_NOT_STARTED, EXAMPLES.STOP_REQUEST_NOT_OPEN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async complete(
    // The body is `{}` and nothing else: the pipe refuses any field, and there is nothing to read.
    @Body() _body: StopRequestBodyDto,
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: StopRequestIdParamDto,
  ) {
    try {
      const now = new Date();

      return { stopRequest: toStopRequestWire(await this.completions.complete(actor, params.id, now), now) };
    } catch (error) {
      throw toStopRequestApiException(error);
    }
  }
}
