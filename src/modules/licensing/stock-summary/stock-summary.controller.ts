import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { StockSummaryQueryDto, StockSummaryResponseDto } from './stock-summary.dto';
import { StockSummaryQueryService } from './stock-summary-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/** What the plans hold, by what they give out: the stock the IT Admin grants from and takes back into (`QĐ-111n`, `US-04-14`). */
@ApiTags('stock-summary')
@Controller({ version: '1' })
export class StockSummaryController {
  constructor(private readonly stock: StockSummaryQueryService) {}

  @Get('stock-summary')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'stockSummaryList', summary: 'List what each plan holds, by what it gives out' })
  @ApiSuccessResponse(StockSummaryResponseDto, {
    message: 'STOCK_SUMMARY.LISTED',
    description:
      'A page of plans by application and plan, each with what it holds counted by what it gives out and never by the records of its subscriptions: the seats of a shared plan (stock.kind SEATS: bought, assigned, free, revoking), the keys of a license-key plan (KEYS: in the store, assigned, withdrawn) and the people who hold a personal account (HOLDERS). It counts over the subscriptions a seat can be taken from today; the seats of a plan are the sum of the seats of those subscriptions in the list of subscriptions. mine=true keeps the plans the caller answers for as their IT Admin and counts only those subscriptions, planId a single plan.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin reads the stock.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: StockSummaryQueryDto) {
    return this.stock.list(query, actor.employeeId);
  }
}
