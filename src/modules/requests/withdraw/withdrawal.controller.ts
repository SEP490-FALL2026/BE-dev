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
import { AccessRequestResponseDto, RequestIdParamDto, WithdrawBodyDto } from '../access-request/access-request.dto';
import {
  ACCESS_REQUEST_ERROR_EXAMPLES as EXAMPLES,
  toAccessRequestApiException,
} from '../access-request/access-request.http-errors';
import { AccessRequestQueryService } from '../request-view/access-request-query.service';
import { toWire } from '../request-view/access-request.mapper';
import { WithdrawalService } from './withdrawal.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The request does not exist, or the caller has no part in it (ACCESS_REQUEST.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/**
 * Withdrawing a request that is still waiting (`US-05-08`). The route is under `access-requests/:id`, like the others of the request,
 * and is declared right after them so the path order of the API does not move.
 */
@ApiTags('access-requests')
@Controller({ path: 'access-requests', version: '1' })
export class WithdrawalController {
  constructor(
    private readonly withdrawals: WithdrawalService,
    private readonly queries: AccessRequestQueryService,
  ) {}

  @Post(':id/withdraw')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestWithdraw', summary: 'Withdraw a request that is still waiting' })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    message: 'ACCESS_REQUEST.WITHDRAWN',
    description:
      'The requester withdraws the request while it waits or while the grant has not been carried out; the head of the department does too, with a reason, once Finance gave it back, it waits for a budget or the data stopped it. The open steps and the questions to Finance close, the request leaves the batch it was sent in, what was held for it goes back to the budget and a task nobody has worked is cancelled with its assignment (never failed). When the grant had failed the request waits (AWAITING_IT_CLOSE) until the IT Admin cancels the task, and it then ends as withdrawn.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is not the requester, the person it was sent for included, and not the head in a stage the head acts on (ACCESS_REQUEST.NOT_REQUESTER).',
      examples: [EXAMPLES.NOT_REQUESTER],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'Nothing is left to withdraw (ACCESS_REQUEST.ALREADY_ENDED), the withdrawal waits for the IT Admin (ACCESS_REQUEST.WITHDRAWAL_PENDING), the task of the grant is being worked: ask again when it has a result (ACCESS_REQUEST.GRANT_RUNNING), or the seat is real and the way back is a return (ACCESS_REQUEST.GRANT_COMPLETED). Nothing changes.',
      examples: [
        EXAMPLES.WITHDRAWAL_ALREADY_ENDED,
        EXAMPLES.WITHDRAWAL_PENDING,
        EXAMPLES.GRANT_RUNNING,
        EXAMPLES.GRANT_COMPLETED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: a blank reason), or the head gives no reason (ACCESS_REQUEST.REASON_REQUIRED). Nothing is saved.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.WITHDRAWAL_REASON_REQUIRED],
    },
  )
  async withdraw(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: WithdrawBodyDto,
  ) {
    try {
      const record = await this.withdrawals.withdraw(actor, params.id, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
