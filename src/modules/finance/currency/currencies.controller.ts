import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { FinanceService } from '../finance.service';
import { toFinanceApiException } from '../mappers/finance.http-errors';
import { CurrencyListResponseDto } from './currency.dto';

/** The currencies the system can price in, with their minor digits. Finance and the IT Admin read them. */
@ApiTags('currencies')
@Controller({ path: 'currencies', version: '1' })
@RequireRoles('FINANCE', 'IT_ADMIN')
export class CurrenciesController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @ApiOperation({ operationId: 'currencyList', summary: 'List supported currencies' })
  @ApiSuccessResponse(CurrencyListResponseDto, {
    message: 'CURRENCY.LISTED',
    description: 'Every currency an amount can be entered in, by code.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, {
    status: HttpStatus.FORBIDDEN,
    description: 'Only Finance and the IT Admin read the currency list.',
  })
  async list() {
    try {
      return { items: await this.finance.listCurrencies() };
    } catch (error) {
      throw toFinanceApiException(error);
    }
  }
}
