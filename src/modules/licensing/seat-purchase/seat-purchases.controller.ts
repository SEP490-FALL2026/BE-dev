import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
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
import { SEAT_PURCHASE_ERROR_EXAMPLES, toSeatPurchaseApiException } from '../../catalog/public/seat-ledger.api';
import { SeatPurchaseBodyDto, SeatPurchaseLineParamDto, SeatPurchaseResponseDto } from './seat-purchase.dto';
import { SeatPurchaseRouteService } from './seat-purchase-route.service';

@ApiTags('subscription-lines')
@Controller({ path: 'subscription-lines', version: '1' })
export class SeatPurchasesController {
  constructor(private readonly seatPurchases: SeatPurchaseRouteService) {}

  @Post(':id/purchases')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'subscriptionLineSeatPurchase',
    summary: 'Record a seat purchase on a subscription line',
  })
  @ApiSuccessResponse(SeatPurchaseResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SEAT_PURCHASE.RECORDED',
    description:
      'Records a batch seat purchase (TOP_UP) and matching GRANT seat changes for pending spend-approved grant tasks.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Caller does not hold IT_ADMIN or does not act for one or more beneficiaries.',
      examples: [FORBIDDEN_EXAMPLE, SEAT_PURCHASE_ERROR_EXAMPLES.NOT_IN_CHARGE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'Subscription line was not found.',
      examples: [SEAT_PURCHASE_ERROR_EXAMPLES.LINE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'Line cannot take purchases, beneficiary has not started yet, pool already has free capacity, or source line still has occupancy.',
      examples: [
        SEAT_PURCHASE_ERROR_EXAMPLES.EMPLOYEE_NOT_STARTED,
        SEAT_PURCHASE_ERROR_EXAMPLES.LINE_NOT_PURCHASABLE,
        SEAT_PURCHASE_ERROR_EXAMPLES.STOCK_AVAILABLE,
        SEAT_PURCHASE_ERROR_EXAMPLES.BELOW_OCCUPANCY,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'Validation failed, effective date falls in a closed month, items are not pending, or tier-step requires one item.',
      examples: [
        VALIDATION_EXAMPLE,
        SEAT_PURCHASE_ERROR_EXAMPLES.EFFECTIVE_IN_CLOSED_MONTH,
        SEAT_PURCHASE_ERROR_EXAMPLES.ITEM_NOT_PENDING,
        SEAT_PURCHASE_ERROR_EXAMPLES.TIER_STEP_ONE_ITEM,
      ],
    },
  )
  async purchase(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SeatPurchaseLineParamDto,
    @Body() body: SeatPurchaseBodyDto,
  ) {
    try {
      return await this.seatPurchases.purchase(actor, params.id, body);
    } catch (error) {
      throw toSeatPurchaseApiException(error);
    }
  }
}
