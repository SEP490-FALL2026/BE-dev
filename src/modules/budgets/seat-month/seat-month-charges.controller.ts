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
import { SeatMonthChargesQueryDto, SeatMonthChargesResponseDto } from './seat-month.dto';
import { SeatMonthQueryService } from './seat-month-query.service';

/**
 * What each department bore of the seats of the shared pool in a month that has ended (`SM-1`, `QĐ-103k`): Finance reads them all and the line of the
 * pool of each subscription; a manager reads the Cost Center of their own department. The rows are written by the system when a month ends.
 */
@ApiTags('seat-month-charges')
@Controller({ path: 'seat-month-charges', version: '1' })
export class SeatMonthChargesController {
  constructor(private readonly seatMonths: SeatMonthQueryService) {}

  @Get()
  @RequireRoles('FINANCE', 'MANAGER')
  @ApiOperation({ operationId: 'seatMonthChargeList', summary: 'List the seat-months of a month' })
  @ApiSuccessResponse(SeatMonthChargesResponseDto, {
    message: 'SEAT_MONTH_CHARGE.LISTED',
    description:
      'The seat-months of the month, one for each seat and department that held it (the days, the price of a month and what the days cost, with the Cost Center that bears it or none yet), and for Finance the line of the shared pool of each subscription: what its invoices of the month cost, what the seat-months took of it, and the rest.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance and the manager of a department read the seat-months.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: SeatMonthChargesQueryDto) {
    return this.seatMonths.list(actor, query, actor.roles.includes('FINANCE'));
  }
}
