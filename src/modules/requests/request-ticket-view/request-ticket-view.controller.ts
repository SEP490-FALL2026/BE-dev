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
import { TicketIdParamDto, TicketResponseDto } from '../request-ticket/request-ticket.dto';
import {
  REQUEST_TICKET_ERROR_EXAMPLES,
  toRequestTicketApiException,
} from '../request-ticket/request-ticket.http-errors';
import { RequestTicketViewService } from './request-ticket-view.service';

@ApiTags('request-tickets')
@Controller({ path: 'request-tickets', version: '1' })
export class RequestTicketViewController {
  constructor(private readonly ticketViews: RequestTicketViewService) {}

  @Get(':id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'requestTicketGet', summary: 'Get a request ticket' })
  @ApiSuccessResponse(TicketResponseDto, {
    message: 'REQUEST_TICKET.FOUND',
    description:
      'Returns the request ticket with the items the caller is allowed to view, sorted by position, and the latest resubmission reply on each visible item. Ticket status is derived across all items in the ticket.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The request ticket does not exist, or the caller cannot view any of its items (REQUEST_TICKET.NOT_FOUND).',
      examples: [REQUEST_TICKET_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The ticket id is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: TicketIdParamDto) {
    try {
      return { ticket: await this.ticketViews.get(actor, params.id) };
    } catch (error) {
      throw toRequestTicketApiException(error);
    }
  }
}
