import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { UsageOverviewPageResponseDto, UsageOverviewQueryDto } from './usage-overview.dto';
import {
  FORBIDDEN_USAGE_READ,
  toUsageOverviewApiException,
  USAGE_OVERVIEW_ERROR_EXAMPLES as EXAMPLES,
} from './usage-overview.http-errors';
import { UsageOverviewQueryService } from './usage-overview-query.service';
import type { UsagePoint } from './usage-overview.types';

const toWire = (point: UsagePoint) => ({
  period: point.period,
  department: point.department,
  application: point.application,
  source: point.source,
  activeDays: point.activeDays,
  coveredDays: point.coveredDays,
  status: point.status,
  updatedAt: point.updatedAt ? point.updatedAt.toISOString() : null,
});

/**
 * The usage of the software as a series of days, for the IT Admin (`QĐ-111aw`): how many days people were active and how many days anything
 * told what happened, by period and by department, application or source. The unit is the day, counted once whatever the number of sources;
 * a token or a volume is never in it, and neither is a name or a rank of a person.
 */
@ApiTags('usage-overview')
@Controller({ path: 'usage-overview', version: '1' })
@RequireRoles('IT_ADMIN')
export class UsageOverviewController {
  constructor(private readonly queries: UsageOverviewQueryService) {}

  @Get()
  @ApiOperation({
    operationId: 'usageOverviewList',
    summary: 'List the days of activity and the days of data of the usage, by period',
  })
  @ApiSuccessResponse(UsageOverviewPageResponseDto, {
    message: 'USAGE_OVERVIEW.LISTED',
    description:
      'A page of the series, oldest period first: for each period (a day, an ISO week or a month, cut to the range) and each department, application or source, the days people were active (activeDays), the days anything told what happened (coveredDays), the status of the data (HAS_DATA, PARTIAL, NO_DATA) and when the data was last updated. Only the people of the departments the caller works are read: a department or a person outside them gives an empty page.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, FORBIDDEN_USAGE_READ, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The query is invalid (VALIDATION_ERROR), or the range ends before it starts or is longer than 366 days (USAGE_OVERVIEW.RANGE_INVALID).',
    examples: [VALIDATION_EXAMPLE, EXAMPLES.RANGE_INVALID],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: UsageOverviewQueryDto) {
    try {
      const page = await this.queries.series(actor, query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toUsageOverviewApiException(error);
    }
  }
}
