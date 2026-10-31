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
import { ManagerDashboardResponseDto, type ManagerDashboardWire } from './manager-dashboard.dto';
import { ManagerDashboardService } from './manager-dashboard.service';

/** The overview a head sees on signing in, for the department they head on the business day. */
@ApiTags('dashboards')
@Controller({ path: 'dashboards/manager', version: '1' })
export class ManagerDashboardController {
  constructor(private readonly dashboard: ManagerDashboardService) {}

  @Get()
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'managerDashboardGet', summary: 'Read my overview as a department head' })
  @ApiSuccessResponse(ManagerDashboardResponseDto, {
    message: 'DASHBOARD.MANAGER_RETRIEVED',
    description:
      'The sections of the overview of the head for the department they head on the business day (asOf), and no other department. The seats the department is granted or manages and the open reviews after a transfer are counted; the queue ready for spending submission, the budget proposals and the lines of the approved version name the operation that lists them; the need decisions waiting, the ghost seats and the actual cost and commitments say they are not available yet and are never shown as zero. No remaining budget, budget check result, company total or usage measure is answered.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, {
    status: HttpStatus.FORBIDDEN,
    description: 'The caller is not a department head on the business day; other roles read their own overview.',
    examples: [FORBIDDEN_EXAMPLE],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal): Promise<ManagerDashboardWire> {
    try {
      return await this.dashboard.overview(actor);
    } catch (error) {
      throw toDashboardApiException(error);
    }
  }
}
