import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { toDashboardApiException } from '../section/dashboard-section.http-errors';
import { ItAdminDashboardResponseDto, type ItAdminDashboardWire } from './it-admin-dashboard.dto';
import { ItAdminDashboardService } from './it-admin-dashboard.service';

/** The overview an IT Admin sees on signing in, for the departments and the work in their charge. */
@ApiTags('dashboards')
@Controller({ path: 'dashboards/it-admin', version: '1' })
export class ItAdminDashboardController {
  constructor(private readonly dashboard: ItAdminDashboardService) {}

  @Get()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'itAdminDashboardGet', summary: 'Read my overview as an IT Admin' })
  @ApiSuccessResponse(ItAdminDashboardResponseDto, {
    message: 'DASHBOARD.IT_ADMIN_RETRIEVED',
    description:
      'The sections of the overview of the IT Admin on the business day (asOf), in their scope: the departments that name them in charge (every active one while nobody usable is named), and the tasks and SaaS reports they are in charge of by default. The open grant and revocation tasks, the open SaaS reports, the departures still handing over and the keys in the vault are counted; the subscriptions near their cancellation deadline and the plan terms to review name the operation that lists them; the discrepancies count the open findings of people active in a vendor with no seat to cover the day, and the machines without a confirmation say they are not available yet and are never shown as zero.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, {
    status: HttpStatus.FORBIDDEN,
    description: 'The caller does not hold the IT Admin role; other roles read their own overview.',
    examples: [FORBIDDEN_EXAMPLE],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal): Promise<ItAdminDashboardWire> {
    try {
      return await this.dashboard.overview(actor);
    } catch (error) {
      throw toDashboardApiException(error);
    }
  }
}
