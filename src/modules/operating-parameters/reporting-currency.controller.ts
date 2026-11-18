import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { successEnvelopeSchema } from '../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../infrastructure/http/dto/zod-dto';
import { RequireRoles } from '../../infrastructure/security/decorators/access.decorators';
import { toOperatingParametersApiException } from './operating-parameters.http-errors';
import { ReportingCurrencyService } from './reporting-currency.service';

class ReportingCurrencyResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ currency: z.string() })),
) {}

const AUTH_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only the Super Admin reads the reporting currency.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;

/**
 * The reporting currency (`US-01-04` AC-9): dong, the one currency every amount is kept in (`QĐ-111an`). It is read here and set nowhere:
 * nothing is converted, so there is no route to change it.
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
    description: 'The reporting currency: the one currency every amount is entered and kept in.',
  })
  @ApiErrorResponses(...AUTH_ERRORS)
  async get() {
    try {
      return await this.currency.get();
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }
}
