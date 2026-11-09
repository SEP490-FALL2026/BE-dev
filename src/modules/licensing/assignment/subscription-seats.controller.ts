import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
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
import { LICENSING_ERROR_EXAMPLES, toLicensingApiException } from '../licensing.http-errors';
import { SeatUsageResponseDto, SubscriptionSeatsParamDto } from './assignment.dto';
import { AssignmentService } from './assignment.service';

/** The seats of a subscription taken and free (`US-02-05` AC-1): the seats bought minus the assignments occupying today. */
@ApiTags('subscriptions')
@Controller({ path: 'subscriptions', version: '1' })
export class SubscriptionSeatsController {
  constructor(private readonly assignments: AssignmentService) {}

  @Get(':id/seat-usage')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'subscriptionSeatUsage', summary: 'Get the seats taken and free of a subscription' })
  @ApiSuccessResponse(SeatUsageResponseDto, {
    message: 'SUBSCRIPTION_SEAT_USAGE.FETCHED',
    description:
      'The seats bought, the assignments occupying today in the organization calendar and the seats free; purchased and free are null while the subscription has no quantity.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin reads the seats of a subscription.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The subscription does not exist (SUBSCRIPTION.NOT_FOUND).',
      examples: [LICENSING_ERROR_EXAMPLES.SUBSCRIPTION_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not a UUID (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async seatUsage(@Param() params: SubscriptionSeatsParamDto) {
    try {
      return await this.assignments.seatUsage(params.id);
    } catch (error) {
      throw toLicensingApiException(error);
    }
  }
}
