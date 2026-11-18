import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ACCESS_REQUEST_ERROR_EXAMPLES } from '../access-request/access-request.http-errors';
import { HistoryIdParamDto, RequestEventPageResponseDto, RequestEventsQueryDto } from './request-history.dto';
import { toRequestHistoryApiException } from './request-history.http-errors';
import { RequestEventsService } from './request-events.service';

/** The history of one request, for the people who read the request. Read only. */
@ApiTags('access-requests')
@Controller({ version: '1' })
export class AccessRequestEventsController {
  constructor(private readonly events: RequestEventsService) {}

  @Get('access-requests/:id/events')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestEventList', summary: 'List what happened to a request' })
  @ApiSuccessResponse(RequestEventPageResponseDto, {
    message: 'ACCESS_REQUEST_HISTORY.EVENTS_LISTED',
    description:
      'One page of what happened to the request, oldest first and then by id: sent, sent again, the need approved or refused (for each person of a request for a group), the reserve confirmed, the spend approved, refused or returned, the assessment of the IT Admin, the grant started, completed or failed, the withdrawal and the closing; pageSize 1 to 100, 20 when left out. Each entry says who acted (or that the system did), the role a decider acted in, the person of a request for a group it is about, and the reason a person wrote when they refused, withdrew, closed, returned or used the reserve. Nothing else of the record of the event is answered: no figure of a budget, amount or check. The people who read the request read its history: the sender, whoever holds or held a need step, the head today of its department, an IT Admin, a spending approver once a spend step was opened on it, Finance once its spend was approved; a person a request for a group is for reads the entries about the whole request and about themselves only. This is not the Audit Trail.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The request does not exist, or the caller may not read it (ACCESS_REQUEST.NOT_FOUND).',
      examples: [ACCESS_REQUEST_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id, the page or its size is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async list(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: HistoryIdParamDto,
    @Query() query: RequestEventsQueryDto,
  ) {
    try {
      return await this.events.page(actor, params.id, query);
    } catch (error) {
      throw toRequestHistoryApiException(error);
    }
  }
}
