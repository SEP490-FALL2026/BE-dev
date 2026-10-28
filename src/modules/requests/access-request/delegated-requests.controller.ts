import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
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
import { ACCESS_REQUEST_ERROR_EXAMPLES as EXAMPLES, toAccessRequestApiException } from './access-request.http-errors';
import { AccessRequestQueryService } from './access-request-query.service';
import { toWire } from './access-request.wire';
import {
  DelegatedBodyDto,
  DelegatedResponseDto,
  GrantQueueQueryDto,
  GrantQueueResponseDto,
} from './delegated-request.dto';
import { DelegatedRequestService } from './delegated-request.service';
import { GrantQueueService } from './grant-queue.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/**
 * A head sends requests for the people of the department, and the IT Admin reads what waits for them to carry out
 * (`US-03-02`). The head is the one who would have confirmed the need, so the sending confirms it; the others only read.
 */
@ApiTags('delegated-requests')
@Controller({ version: '1' })
export class DelegatedRequestsController {
  constructor(
    private readonly delegated: DelegatedRequestService,
    private readonly queries: AccessRequestQueryService,
    private readonly queue: GrantQueueService,
  ) {}

  @Post('delegated-requests')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'delegatedRequestSend', summary: 'Send requests for people of the department' })
  @ApiSuccessResponse(DelegatedResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DELEGATED_REQUEST.SENT',
    description:
      'The head of a department sends requests for the people of the department, one for every person and every tool, with one code for the sending. Each request has the head as who sent it and the person as who it is for, its own branch and amount, and a need step already confirmed by the head: the sending is the confirmation, and nobody confirms it again. A request that costs money waits in the queue of the head to be sent on; one for internal software goes to the IT Admin. The head among the people has their own share routed like any request of theirs. All of the requests are made or none.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller does not head the department (DELEGATED_REQUEST.NOT_HEAD), or is the Super Admin, who sends no request (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).',
      examples: [EXAMPLES.NOT_HEAD, EXAMPLES.SUPER_ADMIN_CANNOT_REQUEST],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'A plan does not exist (ACCESS_REQUEST.PLAN_NOT_FOUND).',
      examples: [EXAMPLES.PLAN_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'A person already holds a seat of a plan (ACCESS_REQUEST.ALREADY_HOLDS_ACCESS), has left the company (DELEGATED_REQUEST.BENEFICIARY_NOT_ACTIVE) or an application is retired (ACCESS_REQUEST.APPLICATION_RETIRED).',
      examples: [EXAMPLES.ALREADY_HOLDS_ACCESS, EXAMPLES.BENEFICIARY_NOT_ACTIVE, EXAMPLES.APPLICATION_RETIRED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The form is invalid (VALIDATION_ERROR), a person is outside the department (DELEGATED_REQUEST.OUTSIDE_DEPARTMENT), has no work email (DELEGATED_REQUEST.EMAIL_REQUIRED), is a contractor, freelancer or intern without the day the access ends (DELEGATED_REQUEST.END_DATE_REQUIRED, DELEGATED_REQUEST.END_DATE_TOO_EARLY), a long term is not confirmed (DELEGATED_REQUEST.TERM_CONFIRMATION_REQUIRED).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.OUTSIDE_DEPARTMENT,
        EXAMPLES.EMAIL_REQUIRED,
        EXAMPLES.END_DATE_REQUIRED,
        EXAMPLES.END_DATE_TOO_EARLY,
        EXAMPLES.DELEGATED_TERM_CONFIRMATION_REQUIRED,
        EXAMPLES.NO_SPEND_FOR_FREE_SOFTWARE,
      ],
    },
  )
  async send(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: DelegatedBodyDto) {
    try {
      const { batchId, records } = await this.delegated.send(actor, body);
      const requests = [];
      for (const record of records) requests.push(toWire(await this.queries.view(record)));

      return { batchId, requests };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }

  @Get('grant-queue')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'grantQueueList', summary: 'List the requests waiting to be carried out' })
  @ApiSuccessResponse(GrantQueueResponseDto, {
    message: 'GRANT_QUEUE.LISTED',
    description:
      'The requests approved in full that the IT Admin has not carried out yet, kept together by the person they are for, then by when they were sent. Each says who asked, the tool, the code of the sending when a head sent it for the person, and the day the access ends for a person who is not staff.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin reads what waits to be carried out.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async grantQueue(@Query() query: GrantQueueQueryDto) {
    try {
      return await this.queue.page(query);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
