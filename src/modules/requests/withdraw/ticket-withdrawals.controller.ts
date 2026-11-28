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
import {
  TicketIdParamDto,
  TicketWithdrawBodyDto,
  TicketWithdrawalResponseDto,
} from '../request-ticket/request-ticket.dto';
import {
  REQUEST_TICKET_ERROR_EXAMPLES as EXAMPLES,
  toRequestTicketApiException,
} from '../request-ticket/request-ticket.http-errors';
import { TicketWithdrawalService } from './ticket-withdrawal.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/** Withdrawing a whole request ticket on behalf of its requester, item by item in position order. */
@ApiTags('request-tickets')
@Controller({ path: 'request-tickets', version: '1' })
export class TicketWithdrawalsController {
  constructor(private readonly withdrawals: TicketWithdrawalService) {}

  @Post(':id/withdrawal')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'requestTicketWithdraw', summary: 'Withdraw a whole request ticket' })
  @ApiSuccessResponse(TicketWithdrawalResponseDto, {
    message: 'REQUEST_TICKET.WITHDRAWN',
    description:
      'Withdraws every item of the ticket in position order, each in its own transaction, on behalf of the requester. Items already withdrawn by the caller report ALREADY_WITHDRAWN without writing again; items past their first decision, already ended, pending IT closure, or with a running or completed grant are skipped with their reason. Items already withdrawn remain unchanged if a later item skips or fails, so retrying the request is safe.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The caller can view the ticket but is not its requester (REQUEST_TICKET.NOT_REQUESTER).',
      examples: [EXAMPLES.NOT_REQUESTER],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The ticket does not exist, or the caller cannot view any of its items (REQUEST_TICKET.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id or body is invalid (VALIDATION_ERROR: a blank or oversized reason). Nothing is saved.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async withdraw(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TicketIdParamDto,
    @Body() body: TicketWithdrawBodyDto,
  ) {
    try {
      return { results: await this.withdrawals.withdraw(actor, params.id, body) };
    } catch (error) {
      throw toRequestTicketApiException(error);
    }
  }
}
