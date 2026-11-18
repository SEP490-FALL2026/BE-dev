import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { toDashboardApiException } from '../section/dashboard-section.http-errors';
import { EmployeeDashboardResponseDto, type EmployeeDashboardWire } from './employee-dashboard.dto';
import { EmployeeDashboardService } from './employee-dashboard.service';

/** The overview an Employee sees on signing in, about themselves only; the same operation serves the web and the mobile app. */
@ApiTags('dashboards')
@Controller({ path: 'dashboards/employee', version: '1' })
export class EmployeeDashboardController {
  constructor(private readonly dashboard: EmployeeDashboardService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'employeeDashboardGet', summary: 'Read my overview as an Employee' })
  @ApiSuccessResponse(EmployeeDashboardResponseDto, {
    message: 'DASHBOARD.EMPLOYEE_RETRIEVED',
    description:
      'The sections of the overview of every signed-in account on the business day (asOf), about the caller only: the software rights held (K4 included) and those about to end within seven days, counted as the list of my software rights shows them; the SaaS error reports the caller sent that are still open (saasIssueList with scope=mine); and the requests the caller sent that are not over, counted as meAccessRequestList with view=open counts them (including a count of zero when none were sent). No cost, seat count or data of another person is answered. Each section names the operation that lists its rows.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE)
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal): Promise<EmployeeDashboardWire> {
    try {
      return await this.dashboard.overview(actor);
    } catch (error) {
      throw toDashboardApiException(error);
    }
  }
}
