import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
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
import { AccessRequestResponseDto, NeedDecisionBodyDto, RequestIdParamDto } from '../access-request/access-request.dto';
import {
  ACCESS_REQUEST_ERROR_EXAMPLES as EXAMPLES,
  toAccessRequestApiException,
} from '../access-request/access-request.http-errors';
import { AccessRequestQueryService } from '../request-view/access-request-query.service';
import { toWire } from '../request-view/access-request.mapper';
import { NeedDecisionService } from './need-decision.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The request does not exist, or the caller has no part in it (ACCESS_REQUEST.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

const INVALID_DECISION = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The decision is invalid (VALIDATION_ERROR: a refusal without a reason, a signature, both a line and outside the plan) or a term over twelve months is approved without a confirmation (ACCESS_REQUEST.TERM_CONFIRMATION_REQUIRED). The head who approves a request that costs money gives a line of the plan of the budget or says it is outside the plan, else nothing is saved (ACCESS_REQUEST.PLAN_LINE_REQUIRED); a line that is not there (ACCESS_REQUEST.LINE_NOT_FOUND) or whose window has gone by and is not confirmed as still needed (ACCESS_REQUEST.STILL_NEEDED_REQUIRED) is refused, and a line or a day is not for anyone else or for a request that costs nothing (ACCESS_REQUEST.SPEND_NOT_APPLICABLE).',
  examples: [
    VALIDATION_EXAMPLE,
    EXAMPLES.TERM_CONFIRMATION_REQUIRED,
    EXAMPLES.PLAN_LINE_REQUIRED,
    EXAMPLES.LINE_NOT_FOUND,
    EXAMPLES.STILL_NEEDED_REQUIRED,
    EXAMPLES.SPEND_NOT_APPLICABLE,
  ],
} as const;

/**
 * The need step of a request (`US-05-02`, `US-05-03`): the person who holds it approves or refuses. The route is under
 * `access-requests/:id`, like the others of the request, and is declared right after them so the path order of the API does not move.
 */
@ApiTags('access-requests')
@Controller({ path: 'access-requests', version: '1' })
export class NeedDecisionController {
  constructor(
    private readonly decisions: NeedDecisionService,
    private readonly queries: AccessRequestQueryService,
  ) {}

  @Post(':id/need-decision')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestNeedDecide', summary: 'Approve or refuse the need step of a request' })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    message: 'ACCESS_REQUEST.NEED_DECIDED',
    description:
      'The person who holds the need step approves or refuses it. A refusal gives its reason; a term over twelve months is approved only with a confirmation. The decision becomes an electronic approval record that is never changed. An approval sends the request on (the IT Admin for internal software, the spend submission for paid software); a refusal ends it with no spend step and no commitment.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller asked for or is given the request (ACCESS_REQUEST.OWN_REQUEST), or does not hold the step (ACCESS_REQUEST.NOT_THE_ASSIGNEE).',
      examples: [EXAMPLES.DECISION_OWN_REQUEST, EXAMPLES.DECISION_NOT_THE_ASSIGNEE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The step is not pending: it is decided, or waits for somebody to hold it (ACCESS_REQUEST.STEP_NOT_PENDING).',
      examples: [EXAMPLES.STEP_NOT_PENDING, EXAMPLES.GROUP_USES_LINES],
    },
    INVALID_DECISION,
  )
  async decide(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: NeedDecisionBodyDto,
  ) {
    try {
      const record = await this.decisions.decide(actor, params.id, {
        decision: body.decision,
        reason: body.reason,
        termConfirmationReason: body.termConfirmation?.reason,
        ...(body.spend
          ? {
              spend: {
                planLine: body.spend.planLine
                  ? { position: body.spend.planLine.position, stillNeeded: body.spend.planLine.stillNeeded ?? false }
                  : null,
                expectedSpendOn: body.spend.expectedSpendOn,
              },
            }
          : {}),
      });

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
