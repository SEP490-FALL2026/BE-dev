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
import { RequestIdParamDto, SimilarSeatsQueryDto, SimilarSeatsResponseDto } from '../access-request/access-request.dto';
import {
  ACCESS_REQUEST_ERROR_EXAMPLES as EXAMPLES,
  toAccessRequestApiException,
} from '../access-request/access-request.http-errors';
import { SimilarSeatsService } from './similar-seats.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The request does not exist, or the caller has no part in it (ACCESS_REQUEST.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/**
 * The seats the person a request is for already holds in tools of the same functional group, read by whoever holds the need step.
 * The route is under `access-requests/:id`, like the others of the request, and is declared right after them so the path order of
 * the API does not move.
 */
@ApiTags('access-requests')
@Controller({ path: 'access-requests', version: '1' })
export class SimilarSeatsController {
  constructor(private readonly similarSeats: SimilarSeatsService) {}

  @Get(':id/similar-seats')
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'accessRequestSimilarSeatList',
    summary: 'List the similar seats of the person asked for',
  })
  @ApiSuccessResponse(SimilarSeatsResponseDto, {
    message: 'ACCESS_REQUEST.SIMILAR_SEATS_LISTED',
    description:
      'The seats the person the request is for already holds in tools of the same functional group, oldest first. Only the person who holds the need step reads them.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller has a part in the request but does not hold its need step (ACCESS_REQUEST.NOT_THE_ASSIGNEE).',
      examples: [EXAMPLES.NOT_ASSIGNEE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id or the query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.EMPLOYEE_REQUIRED],
    },
  )
  async listSimilarSeats(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Query() query: SimilarSeatsQueryDto,
  ) {
    try {
      return await this.similarSeats.list(actor, params.id, query);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
