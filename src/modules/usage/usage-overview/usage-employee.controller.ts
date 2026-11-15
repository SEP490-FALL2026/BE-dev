import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { pageOf } from '../../../core/application/pagination';
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
import {
  UsageEmployeeParamDto,
  UsageSoftwareDetailQueryDto,
  UsageSoftwareDetailResponseDto,
  UsageSoftwareListQueryDto,
  UsageSoftwareListResponseDto,
  UsageSoftwareParamDto,
} from './usage-employee.dto';
import type { SoftwareDetail, SoftwareLine } from './usage-employee.types';
import { UsageEmployeeViewService } from './usage-employee-view.service';
import {
  FORBIDDEN_USAGE_READ,
  toUsageOverviewApiException,
  USAGE_OVERVIEW_ERROR_EXAMPLES as EXAMPLES,
} from './usage-overview.http-errors';

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

const lineToWire = (line: SoftwareLine) => ({ ...line, updatedAt: iso(line.updatedAt) });

const detailToWire = (detail: SoftwareDetail) => ({
  ...detail,
  updatedAt: iso(detail.updatedAt),
  vendorSources: detail.vendorSources.map((source) => ({ ...source, updatedAt: iso(source.updatedAt) })),
  collector: detail.collector ? { ...detail.collector, updatedAt: iso(detail.collector.updatedAt) } : null,
});

const RANGE_422 = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The query or an identifier is invalid (VALIDATION_ERROR), or the range ends before it starts or is longer than 366 days (USAGE_OVERVIEW.RANGE_INVALID).',
  examples: [VALIDATION_EXAMPLE, EXAMPLES.RANGE_INVALID],
} as const;

/**
 * What an IT Admin reads of the usage of one person (`QĐ-111aw`, `QĐ-111ax`): the software they hold a seat of or used, and for one software what
 * each source says of them on its own. The person is their code alone, never a name or a photo, and nothing ranks people; the counts of answers
 * and of tokens are in the detail of one person and one software, and nowhere else. A person outside the departments of the IT Admin is a 404.
 */
@ApiTags('usage-overview')
@Controller({ path: 'employees/:id/usage-software', version: '1' })
@RequireRoles('IT_ADMIN')
export class UsageEmployeeController {
  constructor(private readonly views: UsageEmployeeViewService) {}

  @Get()
  @ApiOperation({
    operationId: 'usageEmployeeSoftwareList',
    summary: 'List the software a person holds a seat of or used',
  })
  @ApiSuccessResponse(UsageSoftwareListResponseDto, {
    message: 'USAGE_EMPLOYEE.LISTED',
    description:
      'A page of the software the person holds a seat of in the range or used in it: whether they hold a seat, the days they were active, the days anything told what happened and the status of the data (HAS_DATA, PARTIAL, NO_DATA). The person is shown by their employee code only. No count of answers or of tokens is here: it is in the detail of one software.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    FORBIDDEN_USAGE_READ,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The employee does not exist or is outside the departments the caller works (USAGE_OVERVIEW.EMPLOYEE_NOT_FOUND): the two are not told apart.',
      examples: [EXAMPLES.EMPLOYEE_NOT_FOUND],
    },
    RANGE_422,
  )
  async list(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: UsageEmployeeParamDto,
    @Query() query: UsageSoftwareListQueryDto,
  ) {
    try {
      const list = await this.views.software(actor, params.id, query);
      const page = pageOf(list.items.map(lineToWire), list.total, query.page, query.pageSize);

      return { employee: list.employee, range: list.range, items: page.items, pagination: page.pagination };
    } catch (error) {
      throw toUsageOverviewApiException(error);
    }
  }

  @Get(':applicationId')
  @ApiOperation({
    operationId: 'usageEmployeeSoftwareGet',
    summary: 'Show what each source says of a person in one software',
  })
  @ApiSuccessResponse(UsageSoftwareDetailResponseDto, {
    message: 'USAGE_EMPLOYEE.FETCHED',
    description:
      'The two kinds of source told apart: for each vendor source the days the person was active in it and the days its reports cover, and for the collector the days it saw their tool with the count of answers and of tokens of each day. Those counts are shown here and nowhere else; they never rank or threshold anyone. The person is shown by their employee code only.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    FORBIDDEN_USAGE_READ,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The employee does not exist or is outside the departments the caller works (USAGE_OVERVIEW.EMPLOYEE_NOT_FOUND), or the application does not exist (USAGE_OVERVIEW.APPLICATION_NOT_FOUND).',
      examples: [EXAMPLES.EMPLOYEE_NOT_FOUND, EXAMPLES.APPLICATION_NOT_FOUND],
    },
    RANGE_422,
  )
  async get(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: UsageSoftwareParamDto,
    @Query() query: UsageSoftwareDetailQueryDto,
  ) {
    try {
      return detailToWire(await this.views.detail(actor, params.id, params.applicationId, query));
    } catch (error) {
      throw toUsageOverviewApiException(error);
    }
  }
}
