import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  SeatCorrectionBodyDto,
  SeatCorrectionLineParamDto,
  SeatCorrectionResponseDto,
  SeatReductionBodyDto,
} from './subscription-line-correction.dto';
import {
  SEAT_CORRECTION_ERROR_EXAMPLES as EXAMPLES,
  toSeatCorrectionApiException,
} from './subscription-line-correction.http-errors';
import { SubscriptionLineCorrectionService } from './subscription-line-correction.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

@ApiTags('subscription-lines')
@Controller({ path: 'subscription-lines', version: '1' })
export class SubscriptionLineSeatsController {
  constructor(private readonly corrections: SubscriptionLineCorrectionService) {}

  @Post(':id/seat-corrections')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'subscriptionLineSeatCorrection',
    summary: 'Record a vendor-side seat correction on a subscription line',
  })
  @ApiSuccessResponse(SeatCorrectionResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SEAT_CORRECTION.RECORDED',
    description:
      'Records a VENDOR_RECORD seat change (out-of-process or reconciliation) on the subscription line ledger.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin responsible for the subscription may record vendor seat corrections.',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_RESPONSIBLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'Subscription line was not found.',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'Line is closed, stale, or the change would reduce seats below current occupancy.',
      examples: [EXAMPLES.BELOW_OCCUPANCY, EXAMPLES.STALE, EXAMPLES.CLOSED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'Validation failed or effective date falls in a closed month.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.EFFECTIVE_IN_CLOSED_MONTH],
    },
  )
  async recordCorrection(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SeatCorrectionLineParamDto,
    @Body() body: SeatCorrectionBodyDto,
  ) {
    try {
      return await this.corrections.recordCorrection(actor, params.id, {
        delta: body.delta,
        effectiveOn: body.effectiveOn,
        note: body.note,
        basis: body.basis,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      });
    } catch (error) {
      throw toSeatCorrectionApiException(error);
    }
  }

  @Post(':id/seat-reductions')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'subscriptionLineSeatReduction',
    summary: 'Record a mid-term seat reduction on a subscription line',
  })
  @ApiSuccessResponse(SeatCorrectionResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SEAT_REDUCTION.RECORDED',
    description:
      'Records a mid-term VENDOR_RECORD REDUCE entry referencing a prior INITIAL, TOP_UP, or RENEWAL entry on the same line.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin responsible for the subscription may record mid-term seat reductions.',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_RESPONSIBLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'Subscription line was not found.',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'Mid-term reduction is disallowed, reduction exceeds the referenced purchase, seats fall below occupancy, or line is closed/stale.',
      examples: [
        EXAMPLES.MID_TERM_REDUCTION_NOT_ALLOWED,
        EXAMPLES.REDUCTION_EXCEEDS_PURCHASE,
        EXAMPLES.BELOW_OCCUPANCY,
        EXAMPLES.STALE,
        EXAMPLES.CLOSED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'Validation failed, invalid refund target, or effective date falls in a closed month.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.EFFECTIVE_IN_CLOSED_MONTH],
    },
  )
  async recordReduction(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SeatCorrectionLineParamDto,
    @Body() body: SeatReductionBodyDto,
  ) {
    try {
      return await this.corrections.recordReduction(actor, params.id, {
        refundedSeatChangeId: body.refundedSeatChangeId,
        quantity: body.quantity,
        effectiveOn: body.effectiveOn,
        note: body.note,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      });
    } catch (error) {
      throw toSeatCorrectionApiException(error);
    }
  }
}
