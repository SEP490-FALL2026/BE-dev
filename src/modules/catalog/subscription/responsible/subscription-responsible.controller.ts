import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
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
import { withoutVendorAdminDetail } from '../pool/subscription-vendor-admins-pool.policy';
import { SubscriptionIdParamDto, SubscriptionResponsibleChangeResponseDto } from '../subscription.dto';
import { SUBSCRIPTION_ERROR_EXAMPLES as EXAMPLES, toSubscriptionApiException } from '../subscription.http-errors';
import { ChangeResponsibleBodyDto } from './subscription-responsible.dto';
import { SubscriptionResponsibleService } from './subscription-responsible.service';

/**
 * Who answers for a subscription changes hands here and nowhere else (`QĐ-118f`): the Super Admin names an IT Admin who works now and says
 * why. No IT Admin does it, not even the one who answers; there is no stand-in for a subscription.
 */
@ApiTags('subscriptions')
@Controller({ path: 'subscriptions', version: '1' })
export class SubscriptionResponsibleController {
  constructor(private readonly responsible: SubscriptionResponsibleService) {}

  @Post(':id/responsible-it-admin')
  @RequireRoles('SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'subscriptionResponsibleItAdminChange',
    summary: 'Name the IT Admin who answers for a subscription',
  })
  @ApiSuccessResponse(SubscriptionResponsibleChangeResponseDto, {
    message: 'SUBSCRIPTION.RESPONSIBLE_CHANGED',
    description:
      'The subscription as it is after the change; changed is false when the IT Admin named already answered for it and nothing was written. The audit trail names who changed it, from whom to whom and the reason.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the Super Admin names who answers for a subscription.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The subscription does not exist (SUBSCRIPTION.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), or the person named is not an IT Admin who works now (SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN): nothing changes.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.RESPONSIBLE_NOT_IT_ADMIN],
    },
  )
  async change(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SubscriptionIdParamDto,
    @Body() body: ChangeResponsibleBodyDto,
  ) {
    try {
      const { subscription, changed } = await this.responsible.change(actor, params.id, body);
      const view = withoutVendorAdminDetail(subscription);

      return {
        ...view,
        createdAt: view.createdAt.toISOString(),
        updatedAt: view.updatedAt.toISOString(),
        changed,
      };
    } catch (error) {
      throw toSubscriptionApiException(error);
    }
  }
}
