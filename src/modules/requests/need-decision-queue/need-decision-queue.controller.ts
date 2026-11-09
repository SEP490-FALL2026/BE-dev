import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
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
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import { NeedQueueQueryDto, NeedQueueResponseDto } from './need-decision-queue.dto';
import { NeedDecisionQueueService } from './need-decision-queue.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/**
 * The queue of the need steps of the person who holds them: the first screen of the head, of the spending approver who decides the
 * need of a head's own request, and of the fallback approver. It opens the request, the similar seats and the lines of the plan
 * with the routes that already read them, and the decision is made with the need decision routes (one person, or line by line for a
 * group); it adds none of its own. Any signed-in account may call it: what it returns is what the routing gave the caller.
 */
@ApiTags('need-decisions')
@Controller({ version: '1' })
export class NeedDecisionQueueController {
  constructor(private readonly queues: NeedDecisionQueueService) {}

  @Get('need-decisions')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'needDecisionList', summary: 'List the requests waiting for my need decision' })
  @ApiSuccessResponse(NeedQueueResponseDto, {
    message: 'NEED_DECISION.LISTED',
    description:
      'The need steps given to the caller that are pending, the oldest first: what each request is, who asked and who it is for, when the step is due, whether approving needs a confirmed term or a line of the plan of the budget, and what the request costs as the request itself says. A step that waits for somebody to hold it, a request the caller asked for or is given, and a request that was decided, withdrawn or ended are not here; neither is any figure of a budget. A request for a group is decided line by line.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The query is invalid (VALIDATION_ERROR: a page or a size that is not a positive number, a size over 100, a kind of request that does not exist).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: NeedQueueQueryDto) {
    try {
      return await this.queues.queue(actor, query);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
