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
import { ListServiceAccountDutiesQueryDto, ServiceAccountDutyPageResponseDto } from './service-account.dto';
import {
  SERVICE_ACCOUNT_ERROR_EXAMPLES as EXAMPLES,
  toServiceAccountApiException,
} from './service-account.http-errors';
import { ServiceAccountDutyService } from './service-account-duty.service';

/** The 503 of every guarded route, and SERVICE_ACCOUNT_DUTY.TOO_MANY when more people are in it than the list can take. */
const UNAVAILABLE_OR_TOO_MANY = {
  ...GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  examples: [...GUARDED_SERVICE_UNAVAILABLE_RESPONSE.examples, EXAMPLES.DUTY_TOO_MANY],
} as const;

/**
 * The service accounts that wait for a person to answer for them before a transfer or a departure takes effect (`US-03-08`). IT Admin
 * only; recording a transfer or a departure is never held for them.
 */
@ApiTags('service-account-duties')
@Controller({ path: 'service-account-duties', version: '1' })
@RequireRoles('IT_ADMIN')
export class ServiceAccountDutiesController {
  constructor(private readonly duties: ServiceAccountDutyService) {}

  @Get()
  @ApiOperation({ operationId: 'serviceAccountDutyList', summary: 'List the service accounts that need a new person' })
  @ApiSuccessResponse(ServiceAccountDutyPageResponseDto, {
    message: 'SERVICE_ACCOUNT_DUTY.LISTED',
    description:
      'A page of the open service accounts whose person has a transfer or a departure that is not closed, the earliest day first. A row names the account, its plan, the department that owns it, the person who answers for it now, the day the transfer or the departure takes effect, which kind of record it is and whether the day has passed. When the day passes the transfer or the departure still takes effect, nothing is revoked and the account keeps its person until one is named; the record cannot be closed until then. Filter by person or by whether the day has passed. When more people than the list can take have a transfer or a departure that waits, the answer is 503 SERVICE_ACCOUNT_DUTY.TOO_MANY: filter by person.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin reads the service accounts that need a new person.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    UNAVAILABLE_OR_TOO_MANY,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'A filter is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Query() query: ListServiceAccountDutiesQueryDto) {
    try {
      return await this.duties.list(query);
    } catch (error) {
      throw toServiceAccountApiException(error);
    }
  }
}
