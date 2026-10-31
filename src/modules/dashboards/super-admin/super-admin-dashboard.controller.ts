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
import { SuperAdminDashboardResponseDto, type SuperAdminDashboardWire } from './super-admin-dashboard.dto';
import { SuperAdminDashboardService } from './super-admin-dashboard.service';

/** The overview the Super Admin sees on signing in: the operation of the system and the organization only. */
@ApiTags('dashboards')
@Controller({ path: 'dashboards/super-admin', version: '1' })
export class SuperAdminDashboardController {
  constructor(private readonly dashboard: SuperAdminDashboardService) {}

  @Get()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'superAdminDashboardGet', summary: 'Read my overview as the Super Admin' })
  @ApiSuccessResponse(SuperAdminDashboardResponseDto, {
    message: 'DASHBOARD.SUPER_ADMIN_RETRIEVED',
    description:
      'The sections of the overview of the Super Admin on the business day (asOf): the operation of the system and the organization, with no seat, approval or spending total. The departments without a head or without a usable IT Admin in charge and the notices of heads waiting to be handled are counted; the congestion board, the approvers, the state of the Super Admin role and the profiles that can get an account name the operation that lists them; the background tasks say they are not available yet and are never shown as zero.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, {
    status: HttpStatus.FORBIDDEN,
    description: 'The caller does not hold the Super Admin role; other roles read their own overview.',
    examples: [FORBIDDEN_EXAMPLE],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal): Promise<SuperAdminDashboardWire> {
    try {
      return await this.dashboard.overview(actor);
    } catch (error) {
      throw toDashboardApiException(error);
    }
  }
}
