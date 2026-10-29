import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
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
import {
  ACCESS_REQUEST_ERROR_EXAMPLES,
  toAccessRequestApiException,
} from '../access-request/access-request.http-errors';
import { RequestTimingsResponseDto, TimingParamDto, type RequestTimingsWire } from './request-timing.dto';
import { RequestTimingService } from './request-timing.service';

/** The time a request took, for the people who may see the request. */
@ApiTags('access-requests')
@Controller({ version: '1' })
export class RequestTimingsController {
  constructor(private readonly timings: RequestTimingService) {}

  @Get('access-requests/:id/timings')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestTimingsGet', summary: 'Read the time a request took' })
  @ApiSuccessResponse(RequestTimingsResponseDto, {
    message: 'ACCESS_REQUEST.TIMINGS_FETCHED',
    description:
      'When the request was sent, when the last approval was given and when the grant was completed, the seconds to approve it, to grant it and in all, and where it waited for each step (the need, the assessment of the IT Admin, the queue of the head, the review of Finance, the decision of the spend and the grant, each a property that is empty when the request had no such step, and open while the step is not over). The time to approve includes the wait of the head to send it on as spend. Only a request whose grant was completed counts in the indicator of the time to grant. The time Finance spends after the approval is not part of it. The people who may see the request read it.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The request does not exist, or the caller may not see it (ACCESS_REQUEST.NOT_FOUND).',
      examples: [ACCESS_REQUEST_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: TimingParamDto) {
    try {
      return { timings: wireOf(await this.timings.timingsOf(actor, params.id)) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}

function wireOf(timings: Awaited<ReturnType<RequestTimingService['timingsOf']>>): RequestTimingsWire {
  const segments: RequestTimingsWire['segments'] = {
    NEED: null,
    IT_ASSESSMENT: null,
    QUEUE_WAIT: null,
    FINANCE_REVIEW: null,
    SPEND_DECISION: null,
    GRANT: null,
  };
  for (const segment of timings.segments) {
    segments[segment.kind] = {
      startedAt: segment.startedAt.toISOString(),
      endedAt: segment.endedAt?.toISOString() ?? null,
      seconds: segment.seconds,
    };
  }

  return {
    ...timings,
    submittedAt: timings.submittedAt.toISOString(),
    approvedAt: timings.approvedAt?.toISOString() ?? null,
    grantCompletedAt: timings.grantCompletedAt?.toISOString() ?? null,
    segments,
  };
}
