import { Body, Controller, Get, HttpStatus, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { successEnvelopeSchema } from '../../infrastructure/http/dto/success-envelope.dto';
import { RequireRoles } from '../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { toOperatingParametersApiException } from './operating-parameters.http-errors';
import { ReportingCurrencyService } from './reporting-currency.service';

class SetReportingCurrencyBodyDto extends createZodDto(z.strictObject({ currency: z.string().regex(/^[A-Z]{3}$/) })) {}
class ReportingCurrencyResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ currency: z.string() })),
) {}
class ReportingCurrencySetResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ currency: z.string(), changed: z.boolean() })),
) {}

const AUTH_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  { status: HttpStatus.FORBIDDEN, description: 'Only the Super Admin reads or sets the reporting currency.' },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;

/**
 * The reporting currency (`US-01-04` AC-9): the one currency every converted value is kept in. The Super Admin can change
 * it until a rate is entered or a subscription has a converted price; after that the route answers 409 and nothing is
 * recomputed.
 */
@ApiTags('operating-parameters')
@Controller({ path: 'reporting-currency', version: '1' })
export class ReportingCurrencyController {
  constructor(private readonly currency: ReportingCurrencyService) {}

  @Get()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'reportingCurrencyGet', summary: 'Get the reporting currency' })
  @ApiSuccessResponse(ReportingCurrencyResponseDto, {
    message: 'REPORTING_CURRENCY.FETCHED',
    description: 'The currency every converted value is kept in.',
  })
  @ApiErrorResponses(...AUTH_ERRORS)
  async get() {
    try {
      return await this.currency.get();
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Put()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'reportingCurrencySet', summary: 'Set the reporting currency' })
  @ApiSuccessResponse(ReportingCurrencySetResponseDto, {
    message: 'REPORTING_CURRENCY.SET',
    description:
      'The currency is the reporting currency from now on; the same currency again changes nothing (changed false).',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.CONFLICT,
      description:
        'A rate was entered or a subscription has a converted price: the currency is locked (REPORTING_CURRENCY.LOCKED, details.reason).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or the currency is not supported (CURRENCY_NOT_SUPPORTED).',
    },
  )
  async set(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: SetReportingCurrencyBodyDto) {
    try {
      return await this.currency.set(actor, body.currency);
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }
}
