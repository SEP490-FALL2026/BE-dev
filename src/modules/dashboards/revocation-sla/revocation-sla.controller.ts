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
import { toDashboardApiException } from '../section/dashboard-section.http-errors';
import { RevocationSlaQueryDto, RevocationSlaResponseDto, type RevocationSlaWire } from './revocation-sla.dto';
import { RevocationSlaQueryService } from './revocation-sla-query.service';

/** How fast the rights of the people who leave or move away are taken back, and how many requests sent again in the grace were granted in time. */
@ApiTags('reports')
@Controller({ path: 'reports/revocation-sla', version: '1' })
export class RevocationSlaController {
  constructor(private readonly report: RevocationSlaQueryService) {}

  @Get()
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({ operationId: 'revocationSlaGet', summary: 'Read the SLA of the revocations of leavers and movers' })
  @ApiSuccessResponse(RevocationSlaResponseDto, {
    message: 'REPORT.REVOCATION_SLA_RETRIEVED',
    description:
      'The report of the revocations of the departures and the transfers whose window of revocations opens from `from` to `to` (the day after the last working day, or the day after the end of the grace). The deadline of a window is its first working day: the IT Admin is on time when the last task of the departure or the transfer is completed by then. The figures are the departures or transfers completed, on time, open and overdue today, the median of the working days the completed ones took and the share on time; each row is one IT Admin or one department, those with the most overdue first. A departure is overdue as the list of departures says it (`revocationOverdue=true`), a right with no task opened included; a transfer, by a task still to do (its tasks carry no due date of their own). `transferReRequests` counts the requests sent again by a person in the grace of their transfer for software they already hold and those granted by the last day of the grace. It is an operational figure beside the overviews, not a KPI. The Super Admin reads the whole company, an IT Admin only the departments they are in charge of or stand in for.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The caller is neither the Super Admin nor an IT Admin.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'A filter is invalid (VALIDATION_ERROR): a day that does not exist, a range that ends before it starts or lasts over 366 days, a source or a grouping that is not one of the values, a page size over 100.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async get(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Query() query: RevocationSlaQueryDto,
  ): Promise<RevocationSlaWire> {
    try {
      return await this.report.report(actor, query);
    } catch (error) {
      throw toDashboardApiException(error);
    }
  }
}
