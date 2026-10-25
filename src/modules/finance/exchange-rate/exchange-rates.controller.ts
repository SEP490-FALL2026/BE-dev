import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { formatRate } from '../../../core/money/rate';
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
import { FINANCE_ERROR_EXAMPLES, toFinanceApiException } from '../mappers/finance.http-errors';
import {
  ExchangeRatePageResponseDto,
  ExchangeRateResponseDto,
  ListExchangeRatesQueryDto,
  RecordExchangeRateBodyDto,
} from './exchange-rate.dto';
import { ExchangeRateService, type ExchangeRateView } from './exchange-rate.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

function toWire(view: ExchangeRateView) {
  return {
    id: view.id,
    currency: view.currency,
    rateDate: view.rateDate,
    rate: formatRate(view.rate),
    reportingCurrency: view.reportingCurrency,
    source: 'MANUAL' as const,
    createdAt: view.createdAt.toISOString(),
  };
}

/**
 * The exchange rates Finance enters by hand (`US-04-05` AC-4). Finance records; the IT Admin may read them (to see
 * which day a draft subscription still lacks a rate for). Every other role is refused, the Super Admin included
 * (`SoD-1`). A recorded rate is never replaced, edited or deleted: there is no route that does.
 */
@ApiTags('exchange-rates')
@Controller({ path: 'exchange-rates', version: '1' })
export class ExchangeRatesController {
  constructor(private readonly rates: ExchangeRateService) {}

  @Get()
  @RequireRoles('FINANCE', 'IT_ADMIN')
  @ApiOperation({ operationId: 'exchangeRateList', summary: 'List exchange rates' })
  @ApiSuccessResponse(ExchangeRatePageResponseDto, {
    message: 'EXCHANGE_RATE.LISTED',
    description: 'A page of rates, newest day first, optionally for one currency and a range of days.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance and the IT Admin read exchange rates.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Query() query: ListExchangeRatesQueryDto) {
    try {
      const page = await this.rates.list(query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toFinanceApiException(error);
    }
  }

  @Post()
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'exchangeRateRecord', summary: 'Record an exchange rate' })
  @ApiSuccessResponse(ExchangeRateResponseDto, {
    status: HttpStatus.CREATED,
    message: 'EXCHANGE_RATE.RECORDED',
    description: 'The rate is recorded for that currency and day, entered by hand.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance records exchange rates.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the currency is not supported (CURRENCY_NOT_SUPPORTED), the rate has more than ten decimals (RATE_SCALE_EXCEEDED) or is not above 0 and below 10000000000 (RATE_OUT_OF_RANGE), the currency is the reporting currency (EXCHANGE_RATE.SAME_AS_REPORTING_CURRENCY), or the day is in the future (EXCHANGE_RATE.DATE_IN_FUTURE) or before 2000-01-01 (EXCHANGE_RATE.DATE_TOO_OLD).',
      // A rate that cannot be read is the ordinary VALIDATION_ERROR too: shown once, by the request example.
      examples: [
        VALIDATION_EXAMPLE,
        FINANCE_ERROR_EXAMPLES.CURRENCY_NOT_SUPPORTED,
        FINANCE_ERROR_EXAMPLES.EXCHANGE_RATE_DATE_IN_FUTURE,
        FINANCE_ERROR_EXAMPLES.EXCHANGE_RATE_DATE_TOO_OLD,
        FINANCE_ERROR_EXAMPLES.EXCHANGE_RATE_SAME_AS_REPORTING_CURRENCY,
        FINANCE_ERROR_EXAMPLES.RATE_OUT_OF_RANGE,
        FINANCE_ERROR_EXAMPLES.RATE_SCALE_EXCEEDED,
      ],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'A rate for that currency and day is already recorded (EXCHANGE_RATE.ALREADY_RECORDED).',
      examples: [FINANCE_ERROR_EXAMPLES.EXCHANGE_RATE_ALREADY_RECORDED],
    },
  )
  async record(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: RecordExchangeRateBodyDto) {
    try {
      return toWire(await this.rates.record(actor, body));
    } catch (error) {
      throw toFinanceApiException(error);
    }
  }
}
